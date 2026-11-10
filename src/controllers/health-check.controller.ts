import { RestBindings, get, getModelSchemaRef, Response } from '@loopback/rest';
import { inject } from '@loopback/core';
import { getLogger, Logger } from '../utils/logger';
import { BitcoinService, BridgeService } from '../services';
import { ServicesBindings } from "../dependency-injection-bindings";
import { HealthInformation } from '../models/health-information.model';
import { BlockBoock, Federation, HealthInformationChecks } from '../models/health-information-checks.model';
import { RskNodeService } from '../services/rsk-node.service';
import { SyncStatusDataService } from '../services/sync-status-data.service';
import { SyncStatusModel } from '../models/rsk/sync-status.model';
import { LastBlockInfo } from '../models/btc-last-block.model';
import { HEALTH_CACHE_TTL_MS } from '../config/resource-budgets';
import { errorsTotal } from '../utils/metrics';
import { ProviderHealthResponse } from '../models/provider-health-report.model';
import {
  providerHealthReports,
  ProviderHealthStore,
} from '../services/provider-health';

const packageJson = require('../../package.json');

/** A health result and when it was produced. */
interface CachedHealth {
  producedAt: number;
  health: HealthInformation;
}

export class HealthCheckController {
  /**
   * Last result, shared across requests.
   *
   * `/health` is public, unauthenticated, and fans out to four dependencies per
   * call, so request volume multiplies upstream load. Two separate bounds keep
   * that in hand and neither replaces the other: this cache bounds the fan-out
   * per unit time, and `RATE_LIMIT_MAX_HEALTH_REQUESTS` bounds the request rate
   * itself. The route used to be exempt from rate limiting altogether — so that
   * monitoring could never be blocked — which left it the one route in the API
   * with no ceiling; it now has its own bucket, which gives monitoring the same
   * guarantee without the hole.
   *
   * Static because a controller instance is created per request.
   */
  private static cached: CachedHealth | undefined;

  logger: Logger;
  private syncStorageService: SyncStatusDataService;
  private rskNodeService: RskNodeService;
  private bitcoinService: BitcoinService;
  private bridgeService: BridgeService;

  constructor(
    @inject(ServicesBindings.BITCOIN_SERVICE)
    bitcoinService: BitcoinService,
    @inject(ServicesBindings.BRIDGE_SERVICE)
    bridgeService: BridgeService,
    @inject(ServicesBindings.RSK_NODE_SERVICE)
    rskNodeService: RskNodeService,
    @inject(ServicesBindings.SYNC_STATUS_DATA_SERVICE)
    syncStorageService: SyncStatusDataService,
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @inject(ServicesBindings.PROVIDER_HEALTH_STORE)
    private providerHealthStore: ProviderHealthStore,
  ) {
    this.logger = getLogger('health-check-controller');
    this.syncStorageService = syncStorageService;
    this.rskNodeService = rskNodeService;
    this.bitcoinService = bitcoinService;
    this.bridgeService = bridgeService;
  }

  @get('/health', {
    responses: {
      '200': {
        description: 'API information',
        content: {
          'application/json': {
            schema: getModelSchemaRef(HealthInformation),
          },
        },
      },
      '500': {
        description: 'API information; at least one dependency check failed',
        content: {
          'application/json': {
            schema: getModelSchemaRef(HealthInformation),
          },
        },
      },
    },
  })
  /**
   * `GET /health` — aggregate health check across the app's four dependencies:
   * the sync-status database, Blockbook, the RSK node, and the RSK Bridge.
   * Each check runs independently and failures are caught individually, so one
   * dependency being down doesn't prevent reporting on the others.
   *
   * Writes the JSON body directly onto the injected `Response`: status `200`
   * if every check succeeded, `500` if any of them failed.
   *
   * Also lists provider health under `providers`, read from the background
   * job's stored results on every call, even when the checks above come from
   * the cache. Reading them contacts no provider, and a provider
   * that is down does not change `up` or the status code: a full locking cap
   * must not take the API out of its load balancer.
   *
   * @returns The `Response` object, already sent, containing `HealthInformation` with one `HealthInformationChecks`/`BlockBoock` entry per dependency.
   */
  async health(): Promise<Response> {
    const snapshot = await this.healthSnapshot();
    // The dependency checks may come from the cache; the provider list never
    // does, so /health and /health/providers always agree.
    const health = {...snapshot, providers: providerHealthReports(this.providerHealthStore)};
    const healthy = !!health.up;

    if (!healthy) {
      errorsTotal.inc({type: 'upstream'});
    }

    // Status semantics are unchanged, cached or not: operators depend on this
    // being a readiness signal.
    this.response.contentType('application/json').status(healthy ? 200 : 500).send(
      health
    );

    return this.response;
  }

  /**
   * The health result, from cache when it is still current.
   *
   * A failing dependency is exactly when polling intensifies, so failures are
   * cached too — but the cached result still says "down". The TTL is
   * `HEALTH_CACHE_TTL_MS`.
   *
   * @returns The aggregate health information.
   */
  async healthSnapshot(): Promise<HealthInformation> {
    const now = Date.now();
    const cached = HealthCheckController.cached;
    if (cached && now - cached.producedAt < HEALTH_CACHE_TTL_MS) {
      return cached.health;
    }

    const version = packageJson.version;
    this.logger.debug({method: 'health', version});
    const health = new HealthInformation();
    health.up = true;
    health.apiVersion = version;

    let dataBase: HealthInformationChecks = await this.getDataBaseInfo(health);
    let blockBook: BlockBoock = await this.getBlockBookInfo(health);
    let rskNode: HealthInformationChecks = await this.getRskNodeInfo(health);
    let bridgeService: HealthInformationChecks = await this.getBridgeInfo(health);

    health.dataBase = dataBase;
    health.blockBook = blockBook;
    health.rskNode = rskNode;
    health.bridgeService = bridgeService;

    HealthCheckController.cached = {producedAt: now, health};
    return health;
  }

  @get('/health/providers', {
    responses: {
      '200': {
        description: 'Health of every provider, from the background job',
        content: {'application/json': {schema: getModelSchemaRef(ProviderHealthResponse)}},
      },
    },
  })
  /**
   * `GET /health/providers` — the health of every provider, as the background
   * job last stored it. The backoffice polls this route on both APIs.
   *
   * Reads the stored results only, so it contacts no provider and needs no
   * cache. Always `200`: a provider that is down is data here, not a failure
   * of this API.
   *
   * @returns Every provider's health, sorted by key; an empty list until the
   * first check ends.
   */
  providers(): ProviderHealthResponse {
    return {providers: providerHealthReports(this.providerHealthStore)};
  }

  /** Forgets the cached result. Intended for tests. */
  static clearCache(): void {
    HealthCheckController.cached = undefined;
  }

  private async getBridgeInfo(health: HealthInformation): Promise<HealthInformationChecks> {
    let bridgeService = new Federation();
    return this.bridgeService.getFederationAddress().then((address: any) => {
      if(address) {
        bridgeService.up = true;
        bridgeService.federationAddress = address;
        return bridgeService;
      } else {
        throw new Error("Error searching Bridge State");
      }
    }).catch((err) => {
      this.logger.error({method: 'getBridgeInfo', err, check: 'bridge'});
      bridgeService.up = false;
      health.up = false;
      return bridgeService;
    });
  }

  private async getBlockBookInfo(health: HealthInformation): Promise<BlockBoock> {
    let blockBook = new BlockBoock();
    return this.bitcoinService.getLastBlock().then((info: LastBlockInfo) => {
      if (info) {
        blockBook.up = true;
        blockBook.lastBtcBlockNumber = info.bestHeight;
        blockBook.lastBtcBlockHash = info.bestBlockHash;
        blockBook.totalBlocks = info.blocks;
        blockBook.syncing = info.inSync;
        blockBook.chain = info.chain;
        return blockBook;
      } else {
        throw new Error("Error searching BTC Block Number");
      }
    }).catch((err) => {
      this.logger.error({method: 'getBlockBookInfo', err, check: 'blockBook'});
      blockBook.up = false;
      health.up = false;
      return blockBook;
    });
  }
  
  private async getRskNodeInfo(health: HealthInformation): Promise<HealthInformationChecks> {
    let rskNode = this.createNewType();
    return this.rskNodeService.getBlockNumber().then((blockNumber:number) => {
      if(blockNumber) {
        rskNode.up = true;
        rskNode.lastRskBlockNumber = blockNumber;
        return rskNode;
      } else {
        throw new Error("Error searching block number");
      }
    }).catch((err) => {
      this.logger.error({method: 'getRskNodeInfo', err, check: 'rskNode'});
      rskNode.up = false;
      health.up = false;
      return rskNode;
    });
  }

  private async getDataBaseInfo(health: HealthInformation): Promise<HealthInformationChecks> {
    let dataBase = this.createNewType();
    return this.syncStorageService.getBestBlock().then((syncStatusModel: SyncStatusModel | undefined) => {
      if(syncStatusModel) {
        dataBase.lastRskBlockNumber = syncStatusModel.rskBlockHeight;
        dataBase.lastRskBlockHash = syncStatusModel.rskBlockHash;
        dataBase.up = true;
        return dataBase;
      } else {
        throw new Error("Block info not found");
      }
    }).catch((err) => {
      this.logger.error({method: 'getDataBaseInfo', err, check: 'database'});
      health.up = false;
      dataBase.up = false;
      return dataBase;
    });
  }

  createNewType() {
    return new HealthInformationChecks();
  }

}
