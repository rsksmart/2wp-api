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
   * `/health` is public, unauthenticated, exempt from rate limiting so that
   * monitoring can never be blocked, and fans out to four dependencies per call.
   * That combination makes request volume multiply upstream load with nothing to
   * bound it. Caching briefly bounds the fan-out without changing what the
   * endpoint reports.
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
    @inject(RestBindings.Http.RESPONSE) private response: Response
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
   * @returns The `Response` object, already sent, containing `HealthInformation` with one `HealthInformationChecks`/`BlockBoock` entry per dependency.
   */
  async health(): Promise<Response> {
    const health = await this.healthSnapshot();

    // Status semantics are unchanged, cached or not: operators depend on this
    // being a readiness signal.
    this.response.contentType('application/json').status(health.up! ? 200 : 500).send(
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
