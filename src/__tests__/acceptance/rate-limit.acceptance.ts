import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {TwpapiApplication} from '../..';
import {
  RATE_LIMIT_MAX_FANOUT_REQUESTS,
  RATE_LIMIT_MAX_REQUESTS,
} from '../../config/resource-budgets';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {UtxoProvider} from '../../services';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../utils/metric-logger';
import {RATE_LIMIT_REJECTED_METRIC} from '../../middleware/rate-limit.middleware';
import {requestRateLimiter} from '../../middleware/rate-limit.middleware';
import {setupApplication} from './test-helper';

const ADDRESS = '1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2';

describe('Rate limiting (Acceptance)', () => {
  let app: TwpapiApplication;
  let baseUrl: string;
  let utxoProviderService: UtxoProvider;
  let originalUtxoProvider: UtxoProvider['utxoProvider'];
  let utxoStub: sinon.SinonStub;

  before('setupApplication', async () => {
    ({app} = await setupApplication());
    baseUrl = app.restServer.url!;
    // Process-wide singleton: the original has to go back on it in `after`.
    utxoProviderService = await app.get(ServicesBindings.UTXO_PROVIDER_SERVICE);
    originalUtxoProvider = utxoProviderService.utxoProvider;

    // `/addresses-info` and `/health` reach Blockbook through BitcoinService.
    // The subject here is how requests are *counted*, which no provider needs to
    // participate in — and leaving them live made the burst 18 real round trips,
    // so an unreachable provider timed the suite out rather than telling us
    // anything about rate limiting.
    app.getBinding(ServicesBindings.BITCOIN_SERVICE).to({
      getAddressInfo: async (address: string) => ({
        address,
        balance: '0',
        totalReceived: '0',
        totalSent: '0',
        unconfirmedBalance: '0',
        unconfirmedTxs: '0',
        txs: 0,
        txids: [],
        page: 1,
        totalPages: 1,
        itemsOnPage: 0,
      }),
      getLastBlock: async () => ({
        bestBlockHash: 'h',
        bestHeight: 1,
        blocks: 1,
        chain: 'test',
        coin: 'Testnet',
        inSync: true,
        initialSync: false,
        syncMode: true,
      }),
    } as never);
  });

  after(async () => {
    utxoProviderService.utxoProvider = originalUtxoProvider;
    await app.stop();
  });

  beforeEach(() => {
    resetMetricCounters();
    utxoStub = sinon.stub().resolves([]);
    utxoProviderService.utxoProvider = utxoStub;
    // The limiter is process-wide and other suites share the process, so each
    // case starts from a known allowance rather than inheriting one.
    requestRateLimiter.reset();
  });

  const postUtxo = () =>
    fetch(`${baseUrl}/utxo`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({addressList: [ADDRESS]}),
    });

  it('refuses a burst past the fan-out allowance with a bounded 429', async () => {
    // Derived from the budget rather than hardcoded, so tuning the budget cannot
    // silently make this test vacuous.
    const burst = RATE_LIMIT_MAX_FANOUT_REQUESTS + 5;
    const statuses: number[] = [];
    for (let i = 0; i < burst; i += 1) {
      statuses.push((await postUtxo()).status);
    }

    const refused = statuses.filter(s => s === 429);
    expect(refused.length).to.be.greaterThan(0);
    expect(statuses.filter(s => s === 200).length).to.equal(
      RATE_LIMIT_MAX_FANOUT_REQUESTS,
    );
  }).timeout(60000);

  it('answers a refusal with the documented bounded body', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_FANOUT_REQUESTS; i += 1) {
      await postUtxo();
    }

    const res = await postUtxo();
    const body = (await res.json()) as {
      error: {statusCode: number; code: string; message: string};
    };

    expect(res.status).to.equal(429);
    expect(body.error.code).to.equal('RATE_LIMITED');
    expect(body.error.statusCode).to.equal(429);
    // Without a retry hint a refused client has no basis for backing off.
    expect(res.headers.get('retry-after')).to.match(/^[0-9]+$/);
    expect(res.headers.get('content-type')).to.match(/application\/json/);
  }).timeout(60000);

  it('never invokes the controller for a refused request', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_FANOUT_REQUESTS; i += 1) {
      await postUtxo();
    }
    const callsWhenAllowed = utxoStub.callCount;

    await postUtxo();
    await postUtxo();

    // The whole point of refusing early: no provider work, no payload parsing.
    expect(utxoStub.callCount).to.equal(callsWhenAllowed);
  }).timeout(60000);

  it('counts refusals under the fan-out route class', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_FANOUT_REQUESTS + 2; i += 1) {
      await postUtxo();
    }

    expect(
      getMetricCounter(RATE_LIMIT_REJECTED_METRIC, {route: 'fanout'}),
    ).to.be.greaterThan(0);
  }).timeout(60000);

  it('keeps serving cheap routes after the fan-out allowance is spent', async () => {
    for (let i = 0; i < RATE_LIMIT_MAX_FANOUT_REQUESTS + 2; i += 1) {
      await postUtxo();
    }

    const res = await fetch(`${baseUrl}/api`);

    // Separate budgets: exhausting the expensive allowance must not deny the
    // cheap routes, and the process must still be serving.
    expect(res.status).to.equal(200);
  }).timeout(60000);

  it('exempts the health endpoint while the general allowance is spent', async () => {
    // Exhaust the cheap-route allowance, then check monitoring still gets
    // through. Two /health calls rather than a burst: each one fans out to four
    // real dependencies, and the exemption logic itself is unit-tested. What
    // this adds is that the exemption holds for the path the middleware actually
    // sees, which a unit test on the limiter cannot show.
    const statuses: number[] = [];
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 3; i += 1) {
      statuses.push((await fetch(`${baseUrl}/api`)).status);
    }
    expect(statuses.filter(s => s === 429).length).to.be.greaterThan(0);

    const health = await fetch(`${baseUrl}/health`);

    // Tripping this would blind the operators rather than protect anything.
    expect(health.status).to.not.equal(429);
  }).timeout(60000);

  // The router accepts more than one spelling of the same route, so the limiter
  // has to count every spelling in the same bucket. Classifying on the text the
  // client sent rather than the route it resolved to made `/utxo/` cost 90 per
  // window instead of 15 — six times the fan-out allowance, from one character.
  const fanoutSpellings = ['/utxo', '/utxo/', '/addresses-info', '/addresses-info/'];

  fanoutSpellings.forEach(path => {
    it(`spends the fan-out allowance on ${path}, not the cheap one`, async () => {
      const burst = RATE_LIMIT_MAX_FANOUT_REQUESTS + 3;
      const statuses: number[] = [];
      for (let i = 0; i < burst; i += 1) {
        const res = await fetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({addressList: [ADDRESS]}),
        });
        statuses.push(res.status);
      }

      // Asserting the *count*, not merely that a 429 appears somewhere: with the
      // cheap allowance of 90 a burst of 18 is refused too — just never. The
      // number of requests that get through is the only thing that tells the two
      // buckets apart.
      expect(statuses.filter(s => s !== 429).length).to.equal(
        RATE_LIMIT_MAX_FANOUT_REQUESTS,
      );
      expect(statuses.filter(s => s === 429).length).to.equal(
        burst - RATE_LIMIT_MAX_FANOUT_REQUESTS,
      );
    }).timeout(60000);
  });

  // The tx-status routes are expensive for a different reason: on a database
  // miss they re-parse a Bridge transaction, and ABI decoding amplifies calldata
  // into heap by ~225x. MAX_BRIDGE_CALLDATA_BYTES bounds one such request; this
  // is what bounds how many can be in flight. Neither bound holds alone — the
  // product is what has to stay small.
  const decodeRoutes = [
    `/tx-status/${'ab'.repeat(32)}`,
    `/tx-status-by-type/${'ab'.repeat(32)}/PEGOUT`,
  ];

  decodeRoutes.forEach(path => {
    it(`spends the fan-out allowance on ${path.split('/')[1]}`, async () => {
      const burst = RATE_LIMIT_MAX_FANOUT_REQUESTS + 3;
      const statuses: number[] = [];
      for (let i = 0; i < burst; i += 1) {
        statuses.push((await fetch(`${baseUrl}${path}`)).status);
      }

      expect(statuses.filter(s => s !== 429).length).to.equal(
        RATE_LIMIT_MAX_FANOUT_REQUESTS,
      );
    }).timeout(60000);
  });
});
