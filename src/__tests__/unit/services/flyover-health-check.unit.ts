import {expect, sinon} from '@loopback/testlab';
import {
  BoundedJsonRequest,
  ProviderHttpStatusError,
  ProviderTimeoutError,
} from '../../../utils/bounded-http-client';
import {
  DiscoveredLiquidityProvider,
  DOWN_AFTER_FAILURES,
  FLYOVER_DISCOVERY_ADDRESSES,
  flyoverDiscoveryAddress,
  FlyoverHealthCheck,
  LIQUIDITY_PROVIDER_CHECK_TIMEOUT_MS,
  ProviderCheckFailure,
  ProviderHealthStore,
} from '../../../services/provider-health';

const LP_1: DiscoveredLiquidityProvider = {
  id: 1n,
  name: 'Default Provider',
  apiBaseUrl: 'https://lps.example.com',
  status: true,
};
const LP_2: DiscoveredLiquidityProvider = {
  id: 2n,
  name: 'Teks',
  apiBaseUrl: 'https://lps.other.example/',
  status: true,
};

const OK = {status: 'ok'};
const DEGRADED = {status: 'degraded'};

describe('Flyover health check', () => {
  let getProviders: sinon.SinonStub;
  let fetchJson: sinon.SinonStub;
  let store: ProviderHealthStore;
  let flyoverCheck: FlyoverHealthCheck;

  function answer(byHost: Record<string, unknown>): void {
    fetchJson.callsFake(async (req: BoundedJsonRequest) => {
      const result = byHost[new URL(req.url).host];
      if (result instanceof Error) {
        throw result;
      }
      return result;
    });
  }

  function failureOf(promise: Promise<void>): Promise<unknown> {
    return promise.then(
      () => undefined,
      (e: unknown) => e,
    );
  }

  beforeEach(() => {
    getProviders = sinon.stub().resolves([LP_1, LP_2]);
    fetchJson = sinon.stub();
    answer({'lps.example.com': OK, 'lps.other.example': OK});
    store = new ProviderHealthStore();
    flyoverCheck = new FlyoverHealthCheck({getProviders}, store, fetchJson);
  });

  it('reports under the flyover key', () => {
    expect(flyoverCheck.provider).to.equal('flyover');
  });

  it("passes when every LP is healthy, calling each LP's /health once with no retries", async () => {
    await flyoverCheck.check();

    const requests = fetchJson.getCalls().map(call => call.args[0] as BoundedJsonRequest);
    expect(requests.map(req => [req.url, req.maxRetries]).sort()).to.deepEqual([
      ['https://lps.example.com/health', 0],
      ['https://lps.other.example/health', 0],
    ]);
    expect(
      store.getLiquidityProviders('flyover').map(lp => [lp.id, lp.name, lp.status]),
    ).to.deepEqual([
      [1, 'Default Provider', 'up'],
      [2, 'Teks', 'up'],
    ]);
  });

  it('passes while at least one LP is healthy, storing a degraded one as down', async () => {
    answer({'lps.example.com': OK, 'lps.other.example': DEGRADED});

    await flyoverCheck.check();

    const [lp1, lp2] = store.getLiquidityProviders('flyover');
    expect(lp1.status).to.equal('up');
    expect(lp2).to.containDeep({status: 'down', reason: 'error'});
  });

  it('fails with the reason every LP shares, or error when they differ', async () => {
    answer({
      'lps.example.com': new ProviderHttpStatusError(502),
      'lps.other.example': new ProviderHttpStatusError(503),
    });
    expect(await failureOf(flyoverCheck.check())).to.containDeep({reason: 'http_5xx'});

    answer({
      'lps.example.com': new ProviderHttpStatusError(502),
      'lps.other.example': new ProviderTimeoutError(LIQUIDITY_PROVIDER_CHECK_TIMEOUT_MS),
    });
    expect(await failureOf(flyoverCheck.check())).to.containDeep({reason: 'error'});
  });

  it('counts an LP whose URL is not https as down without calling it', async () => {
    getProviders.resolves([{...LP_1, apiBaseUrl: 'http://10.0.0.5:8080'}]);

    expect(await failureOf(flyoverCheck.check())).to.containDeep({reason: 'error'});
    sinon.assert.notCalled(fetchJson);
  });

  it('ignores disabled LPs', async () => {
    getProviders.resolves([LP_1, {...LP_2, status: false}]);

    await flyoverCheck.check();

    expect(store.getLiquidityProviders('flyover').map(lp => lp.id)).to.deepEqual([1]);
    sinon.assert.calledOnce(fetchJson);
  });

  it('fails with no_capacity when no LP is enabled', async () => {
    getProviders.resolves([{...LP_1, status: false}]);

    expect(await failureOf(flyoverCheck.check())).to.containDeep({reason: 'no_capacity'});
    expect(store.getLiquidityProviders('flyover')).to.deepEqual([]);
  });

  it('applies the up/down rules to each LP across rounds', async () => {
    await flyoverCheck.check();
    answer({'lps.example.com': OK, 'lps.other.example': DEGRADED});

    for (let round = 1; round < DOWN_AFTER_FAILURES; round++) {
      await flyoverCheck.check();
      expect(store.getLiquidityProviders('flyover')[1].status).to.equal('up');
    }
    await flyoverCheck.check();

    expect(store.getLiquidityProviders('flyover')[1].status).to.equal('down');
  });

  it('passes the discovery error on when the LP list was never read', async () => {
    const nodeDown = new Error('node down');
    getProviders.rejects(nodeDown);

    expect(await failureOf(flyoverCheck.check())).to.equal(nodeDown);
    sinon.assert.notCalled(fetchJson);
  });

  it('keeps checking the last listed LPs when discovery fails later', async () => {
    await flyoverCheck.check();
    getProviders.rejects(new Error('node down'));
    fetchJson.resetHistory();

    await flyoverCheck.check();

    sinon.assert.calledTwice(fetchJson);
  });

  it('fails with error when no discovery address is configured', async () => {
    const unconfigured = new FlyoverHealthCheck(undefined, store, fetchJson);

    await expect(unconfigured.check()).to.be.rejectedWith(ProviderCheckFailure, {
      reason: 'error',
    });
  });

  it('takes the discovery address from FLYOVER_DISCOVERY_ADDRESS, then from NETWORK', () => {
    expect(
      flyoverDiscoveryAddress({FLYOVER_DISCOVERY_ADDRESS: '0xabc', NETWORK: 'mainnet'}),
    ).to.equal('0xabc');
    expect(flyoverDiscoveryAddress({FLYOVER_DISCOVERY_ADDRESS: '', NETWORK: 'mainnet'})).to.equal(
      FLYOVER_DISCOVERY_ADDRESSES.mainnet,
    );
    expect(flyoverDiscoveryAddress({})).to.equal(FLYOVER_DISCOVERY_ADDRESSES.testnet);
    expect(flyoverDiscoveryAddress({NETWORK: 'regtest'})).to.be.undefined();
  });
});
