import {expect, sinon} from '@loopback/testlab';
import {HealthCheckController} from '../../controllers/health-check.controller';
import {HealthInformation} from '../../models/health-information.model';
import {BitcoinService, BridgeService} from '../../services';
import {
  providerHealthReports,
  ProviderHealthState,
  ProviderHealthStore,
} from '../../services/provider-health';
import {RskNodeService} from '../../services/rsk-node.service';
import {SyncStatusDataService} from '../../services/sync-status-data.service';

const SINCE = new Date('2026-11-08T09:58:30.000Z');
const CHECKED_AT = new Date('2026-11-08T10:00:30.000Z');

const powpegDown: ProviderHealthState = {
  status: 'down',
  since: SINCE,
  reason: 'timeout',
  durationMs: 10_000,
  checkedAt: CHECKED_AT,
  opposingStreak: 0,
};

/** What the routes return for `powpegDown`. */
const powpegDownReport = {
  provider: 'powpeg',
  status: 'down',
  reason: 'timeout',
  latencyMs: 10_000,
  checkedAt: '2026-11-08T10:00:30.000Z',
  since: '2026-11-08T09:58:30.000Z',
};

describe('Provider health in /health and /health/providers', () => {
  let store: ProviderHealthStore;
  let sent: {status?: number; body?: HealthInformation};
  let bridge: {getFederationAddress: sinon.SinonStub};
  let controller: HealthCheckController;

  beforeEach(() => {
    HealthCheckController.clearCache();
    store = new ProviderHealthStore();
    sent = {};
    bridge = {getFederationAddress: sinon.stub().resolves('2N88')};
    const response = {
      contentType() {
        return this;
      },
      status(code: number) {
        sent.status = code;
        return this;
      },
      send(body: HealthInformation) {
        sent.body = body;
        return this;
      },
    };
    controller = new HealthCheckController(
      {
        getLastBlock: sinon.stub().resolves({bestHeight: 5, bestBlockHash: 'h', blocks: 5, inSync: true, chain: 'test'}),
      } as unknown as BitcoinService,
      bridge as unknown as BridgeService,
      {getBlockNumber: sinon.stub().resolves(7)} as unknown as RskNodeService,
      {
        getBestBlock: sinon.stub().resolves({rskBlockHeight: 6, rskBlockHash: 'r'}),
      } as unknown as SyncStatusDataService,
      response as never,
      store,
    );
  });

  after(() => HealthCheckController.clearCache());

  describe('GET /health', () => {
    it('lists no providers before the first check ends', async () => {
      await controller.health();

      expect(sent.body!.providers).to.deepEqual([]);
    });

    it('lists the stored providers', async () => {
      store.set('powpeg', powpegDown);

      await controller.health();

      expect(sent.body!.providers).to.deepEqual([powpegDownReport]);
    });

    it('reads providers on every call, not from the cache', async () => {
      await controller.health(); // caches the dependency checks
      store.set('powpeg', powpegDown);

      await controller.health(); // still within HEALTH_CACHE_TTL_MS

      expect(sent.body!.providers).to.deepEqual([powpegDownReport]);
      sinon.assert.calledOnce(bridge.getFederationAddress); // the checks stayed cached
    });

    it('stays 200 and up while a provider is down', async () => {
      // A full locking cap or a slow bridge must not take the API out of its
      // load balancer: provider health is reported, not acted on, here.
      store.set('powpeg', powpegDown);

      await controller.health();

      expect(sent.status).to.equal(200);
      expect(sent.body!.up).to.be.true();
    });
  });

  describe('GET /health/providers', () => {
    it('returns an empty list before the first check ends', () => {
      expect(controller.providers()).to.deepEqual({providers: []});
    });

    it('returns the stored results and contacts no provider', () => {
      store.set('powpeg', powpegDown);

      expect(controller.providers()).to.deepEqual({providers: [powpegDownReport]});
      sinon.assert.notCalled(bridge.getFederationAddress);
    });

    it('is not held back by the /health cache', async () => {
      await controller.health();
      store.set('powpeg', powpegDown);

      expect(controller.providers().providers).to.have.length(1);
    });
  });

  describe('report shape', () => {
    it('matches the swap API: latencyMs, ISO timestamps, no internal fields', () => {
      store.set('powpeg', {...powpegDown, opposingStreak: 2});

      const [report] = providerHealthReports(store);

      expect(Object.keys(report).sort()).to.deepEqual(
        ['checkedAt', 'latencyMs', 'provider', 'reason', 'since', 'status'],
      );
      expect(report).to.deepEqual(powpegDownReport);
    });

    it('nests the liquidity providers under flyover only', () => {
      store.set('flyover', {...powpegDown, status: 'up', reason: null});
      store.set('powpeg', powpegDown);
      store.setLiquidityProviders('flyover', [{id: 2, name: 'Teks', ...powpegDown}]);

      const [flyover, powpeg] = providerHealthReports(store);

      expect(flyover.liquidityProviders).to.deepEqual([
        {
          id: 2,
          name: 'Teks',
          status: 'down',
          reason: 'timeout',
          latencyMs: 10_000,
          checkedAt: '2026-11-08T10:00:30.000Z',
          since: '2026-11-08T09:58:30.000Z',
        },
      ]);
      expect(powpeg).to.deepEqual(powpegDownReport);
    });

    it('reports a null reason for a provider that is up', () => {
      store.set('powpeg', {...powpegDown, status: 'up', reason: null});

      expect(providerHealthReports(store)[0].reason).to.be.null();
    });
  });
});
