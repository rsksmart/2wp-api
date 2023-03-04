import { RestBindings, get, getModelSchemaRef, Response } from '@loopback/rest';
import { getLogger, Logger } from 'log4js';
import { BitcoinService, BridgeService } from '../services';
import { ServicesBindings } from "../dependency-injection-bindings";
import { HealthInformation } from '../models/health-information.model';
import { BlockBoock, Federation, HealthInformationChecks } from '../models/health-information-checks.model';
import { RskNodeService } from '../services/rsk-node.service';
import { SyncStatusDataService } from '../services/sync-status-data.service';
import { SyncStatusModel } from '../models/rsk/sync-status.model';
import { LastBlockInfo } from '../models/btc-last-block.model';
import { inject } from '@loopback/core';

const packageJson = require('../../package.json');

export class HealthCheckController {
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
    },
  })
  async health(): Promise<Response> {
    const version = packageJson.version;
    this.logger.debug(`[healthCheckController] current version : ${version}`);
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

    this.response.contentType('application/json').status(health.up!! ? 200 : 500).send(
      health
    );
    
    return this.response;
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
    }).catch((e) => {
      this.logger.error(`[healthCheckController-BridgeError] error : ${e}`);
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
    }).catch((e) => {
      this.logger.error(`[healthCheckController-BlockBook] error : ${e}`);
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
    }).catch((e) => {
      this.logger.error(`[healthCheckController-RskNodeInfoError] error : ${e}`);
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
        throw new Error("[healthCheckController-DataBaseError] - Block info not found");
      }
    }).catch((e) => {
      this.logger.error(`[healthCheckController-DataBaseError] error : ${e}`);
      health.up = false;
      dataBase.up = false;
      return dataBase;
    });
  }

  createNewType() {
    return new HealthInformationChecks();
  }

}
