import {expect} from '@loopback/testlab';
import nock from 'nock';
import sinon from 'sinon';
import {
  MAX_PROVIDER_RESPONSE_BYTES,
  MAX_TX_PROVIDER_RESPONSE_BYTES,
  TX_PROVIDER_MAX_IN_FLIGHT,
} from '../../../config/resource-budgets';
import {fetchTx} from '../../../services/tx-service.service';
import {fetchTxV2} from '../../../services/tx-v2-service.service';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  blockbookPermits,
  PermitRejectedError,
  txProviderPermits,
} from '../../../utils/provider-permits';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

const HOST = 'http://blockbook.test';
const JSON_HEADERS = {'content-type': 'application/json'};
const MB = 1024 * 1024;

/** A transaction response of approximately `bytes`, dominated by `hex`. */
const txOf = (bytes: number) => {
  const scaffolding = 220;
  return {
    txid: 'a'.repeat(64),
    version: 1,
    vin: [{n: 0}],
    vout: [{n: 0}],
    blockhash: '0'.repeat(64),
    blockheight: 800000,
    confirmations: 6,
    time: 1,
    blocktime: 1,
    valueOut: '1',
    valueIn: '2',
    fees: '3',
    hex: 'ab'.repeat(Math.max(1, Math.floor((bytes - scaffolding) / 2))),
  };
};

/**
 * The two endpoints the finding is about.
 *
 * `GET /tx` and the pegin status path return the raw Bitcoin transaction in
 * `hex`, so their responses are the only ones here measured in megabytes. An
 * oversized one used to reach `postman-request`, raise
 * `Cannot create a string longer than 0x1fffffe8 characters` — an error absent
 * from the allowlist in `index.ts` — and take the process down through
 * `shutdown()`.
 */
describe('Services: bounded transaction lookups', () => {
  let previousBlockbookUrl: string | undefined;

  before(() => {
    previousBlockbookUrl = process.env.BLOCKBOOK_URL;
    process.env.BLOCKBOOK_URL = `${HOST}/`;
    if (!nock.isActive()) {
      nock.activate();
    }
  });

  after(() => {
    process.env.BLOCKBOOK_URL = previousBlockbookUrl;
    nock.cleanAll();
    nock.enableNetConnect();
    nock.restore();
  });

  beforeEach(() => {
    resetMetricCounters();
    nock.cleanAll();
    sinon.restore();
  });

  describe('legitimate transactions still resolve — the risk that matters', () => {
    it('accepts a multi-megabyte transaction with its hex intact', async () => {
      // The failure mode of a mis-calibrated budget is not a crash, it is a 502
      // on real transactions that nobody notices until a user complains. A
      // mined Bitcoin transaction approaching 1 MB is ~2 MB of hex, and `hex` is
      // in the public contract of GET /tx.
      nock(HOST)
        .get('/api/v1/tx/big')
        .reply(200, txOf(4 * MB), JSON_HEADERS);

      const [tx] = await fetchTx('big');

      expect(tx.hex.length).to.be.greaterThan(2_000_000);
      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.PROVIDER_RESPONSE_BYTES,
        }),
      ).to.equal(0);
    }).timeout(30000);

    it('would have refused that same transaction on the general budget', async () => {
      // States the reason the dedicated budget exists, rather than leaving it to
      // a comment: 4 MB is comfortably over MAX_PROVIDER_RESPONSE_BYTES.
      expect(4 * MB).to.be.greaterThan(MAX_PROVIDER_RESPONSE_BYTES);
      expect(4 * MB).to.be.lessThan(MAX_TX_PROVIDER_RESPONSE_BYTES);
    });

    it('accepts the v2 lookup at the same size', async () => {
      nock(HOST)
        .get('/api/v2/tx/big')
        .reply(200, txOf(4 * MB), JSON_HEADERS);

      const [tx] = await fetchTxV2('big');

      expect((tx as unknown as {hex: string}).hex.length).to.be.greaterThan(
        2_000_000,
      );
    }).timeout(30000);
  });

  describe('the dedicated budget is enforced', () => {
    it('refuses past the dedicated budget with a bounded 502', async () => {
      nock(HOST)
        .get('/api/v1/tx/huge')
        .reply(200, '{}', {
          ...JSON_HEADERS,
          'content-length': String(MAX_TX_PROVIDER_RESPONSE_BYTES + 1),
        });

      let caught: any = null;
      try {
        await fetchTx('huge');
      } catch (err) {
        caught = err;
      }

      expect(caught.statusCode).to.equal(502);
      expect(caught.message).to.match(/exceeded the configured size budget/);
      // Nothing from the response reaches the caller.
      expect(caught.message).to.not.match(/abab/);
    });

    it('records the violation under the transaction operation label', async () => {
      nock(HOST)
        .get('/api/v2/tx/huge')
        .reply(200, '{}', {
          ...JSON_HEADERS,
          'content-length': String(MAX_TX_PROVIDER_RESPONSE_BYTES + 1),
        });

      await expect(fetchTxV2('huge')).to.be.rejected();

      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.PROVIDER_RESPONSE_BYTES,
        }),
      ).to.equal(1);
    });
  });

  describe('the dedicated pool is used, and it is the small one', () => {
    it('takes a permit from the transaction pool, not the general one', async () => {
      const txRun = sinon.spy(txProviderPermits, 'run');
      const generalRun = sinon.spy(blockbookPermits, 'run');
      nock(HOST).get('/api/v1/tx/abc').reply(200, txOf(1024), JSON_HEADERS);

      await fetchTx('abc');

      sinon.assert.calledOnce(txRun);
      sinon.assert.notCalled(generalRun);
      expect(txProviderPermits.active).to.equal(0);
    });

    it('holds concurrency to the pool limit, and refuses rather than queueing without end', async () => {
      // The budget bounds one response; this is what stops concurrent callers
      // multiplying it. Without the pool, `3 x 8 MiB x inbound concurrency` is
      // unbounded by anything in the process.
      // Sampled from the pool itself, while requests are genuinely in flight.
      // Counting inside the reply function without a delay would increment and
      // decrement in the same tick and report a peak of 1 no matter what the
      // limit was — a test that passes with the pool removed entirely.
      let peak = 0;
      nock(HOST)
        .persist()
        .get(/\/api\/v1\/tx\/.*/)
        .delay(25)
        .reply(200, () => {
          peak = Math.max(peak, txProviderPermits.active);
          return txOf(1024);
        }, JSON_HEADERS);

      const inFlight = TX_PROVIDER_MAX_IN_FLIGHT * 4;
      await Promise.all(
        Array.from({length: inFlight}, (_, i) => fetchTx(`t${i}`)),
      );

      // Both directions: never above the limit, and actually reaching it —
      // otherwise the assertion would hold for a pool of one.
      expect(peak).to.equal(TX_PROVIDER_MAX_IN_FLIGHT);
      expect(txProviderPermits.active).to.equal(0);
    }).timeout(30000);

    it('surfaces a full pool as a 503, not as a provider failure', () => {
      // A refusal here is this service saying it is at capacity. Reporting it as
      // a bad gateway would blame Blockbook for a decision taken locally, and
      // make the two indistinguishable in monitoring.
      const err = new PermitRejectedError('blockbook-tx', 'queue_full');
      expect(err.statusCode).to.equal(503);
      expect(err.code).to.equal('SERVICE_OVERLOADED');
    });
  });

  describe('the shapes the callers depend on', () => {
    it('still returns a one-element array from the v1 lookup', async () => {
      nock(HOST).get('/api/v1/tx/abc').reply(200, txOf(512), JSON_HEADERS);

      const result = await fetchTx('abc');

      expect(result).to.be.an.Array();
      expect(result).to.have.length(1);
    });

    it('URL-encodes the transaction id it interpolates into the path', async () => {
      const scope = nock(HOST)
        .get('/api/v1/tx/%2F..%2Fevil')
        .reply(200, txOf(512), JSON_HEADERS);

      await fetchTx('/../evil');

      expect(scope.isDone()).to.be.true();
    });
  });
});
