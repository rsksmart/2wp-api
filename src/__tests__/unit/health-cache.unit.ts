import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {HEALTH_CACHE_TTL_MS} from '../../config/resource-budgets';
import {HealthCheckController} from '../../controllers/health-check.controller';
import {BitcoinService, BridgeService} from '../../services';
import {RskNodeService} from '../../services/rsk-node.service';
import {SyncStatusDataService} from '../../services/sync-status-data.service';

/**
 * `GET /health` is public, unauthenticated, exempt from rate limiting (so
 * monitoring cannot be blocked), and fans out to four dependencies per call.
 * That combination makes it the one route where request volume multiplies
 * upstream load without a bound, so the result is cached briefly.
 *
 * The 200/500 semantics must not change: operators depend on this as a readiness
 * signal.
 */
describe('Controller: health check caching', () => {
  let clock: sinon.SinonFakeTimers;
  let getLastBlock: sinon.SinonStub;
  let getFederationAddress: sinon.SinonStub;
  let getBlockNumber: sinon.SinonStub;
  let getBestBlock: sinon.SinonStub;

  const givenController = () => {
    getLastBlock = sinon.stub().resolves({
      bestHeight: 5,
      bestBlockHash: 'h',
      blocks: 5,
      inSync: true,
      chain: 'test',
    });
    getFederationAddress = sinon.stub().resolves('2N88');
    getBlockNumber = sinon.stub().resolves(7);
    getBestBlock = sinon.stub().resolves({rskBlockHeight: 6, rskBlockHash: 'r'});

    const response = {
      contentType() {
        return this;
      },
      status() {
        return this;
      },
      send() {
        return this;
      },
    };
    return new HealthCheckController(
      {getLastBlock} as unknown as BitcoinService,
      {getFederationAddress} as unknown as BridgeService,
      {getBlockNumber} as unknown as RskNodeService,
      {getBestBlock} as unknown as SyncStatusDataService,
      response as never,
    );
  };

  beforeEach(() => {
    clock = sinon.useFakeTimers();
    HealthCheckController.clearCache();
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('queries every dependency on the first call', async () => {
    const controller = givenController();

    await controller.health();

    sinon.assert.calledOnce(getLastBlock);
    sinon.assert.calledOnce(getFederationAddress);
    sinon.assert.calledOnce(getBlockNumber);
    sinon.assert.calledOnce(getBestBlock);
  });

  it('serves a burst from one fan-out', async () => {
    const controller = givenController();

    for (let i = 0; i < 25; i += 1) {
      await controller.health();
    }

    // Without this, 25 monitoring polls are 100 upstream calls.
    sinon.assert.calledOnce(getLastBlock);
    sinon.assert.calledOnce(getFederationAddress);
  });

  it('refreshes once the cache expires', async () => {
    const controller = givenController();
    await controller.health();

    clock.tick(HEALTH_CACHE_TTL_MS + 1);
    await controller.health();

    // A readiness signal that never refreshes is worse than no signal.
    sinon.assert.calledTwice(getLastBlock);
  });

  it('reports the same status from the cache as from a fresh check', async () => {
    const controller = givenController();

    const fresh = await controller.healthSnapshot();
    const cached = await controller.healthSnapshot();

    expect(cached.up).to.equal(fresh.up);
    expect(cached.blockBook.up).to.equal(fresh.blockBook.up);
  });

  it('caches an unhealthy result too, without changing its status', async () => {
    const controller = givenController();
    getLastBlock.rejects(new Error('blockbook down'));

    const first = await controller.healthSnapshot();
    const second = await controller.healthSnapshot();

    // A failing dependency is exactly when polling intensifies, so the cache
    // has to hold for failures as well — but it must still say "down".
    expect(first.up).to.be.false();
    expect(second.up).to.be.false();
    sinon.assert.calledOnce(getLastBlock);
  });
});
