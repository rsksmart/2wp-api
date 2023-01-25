import { get, getModelSchemaRef } from '@loopback/rest';
import { getLogger, Logger } from 'log4js';
import { inject } from '@loopback/core';
import { BitcoinService, BridgeService } from '../services';
import { ServicesBindings } from "../dependency-injection-bindings";
import { HealthInformation } from '../models/health-information.model';
import { HealthInformationChecks } from '../models/health-information-checks.model';
import { RskNodeService } from '../services/rsk-node.service';
import { SyncStatusDataService } from '../services/sync-status-data.service';
import { SyncStatusModel } from '../models/rsk/sync-status.model';
import { LastBlockInfo } from '../models/btc-last-block.model';

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
  async health(): Promise<HealthInformation> {
    const version = packageJson.version;
    this.logger.debug(`[healthCheckController] current version : ${version}`);
    const health = new HealthInformation();
    health.up = true;
    health.check = [];

    let dataBase: HealthInformationChecks =  await this.getDataBaseInfo(health);
    let blockBook: HealthInformationChecks = await this.getBlockBookInfo(health);
    let rskNode: HealthInformationChecks = await this.getRskNodeInfo(health);
    let bridgeService: HealthInformationChecks = await this.getBridgeInfo(health);

    health.check.push(dataBase);
    health.check.push(blockBook);
    health.check.push(rskNode);
    health.check.push(bridgeService);
    
    return health;
  }

  private async getBridgeInfo(health: HealthInformation): Promise<HealthInformationChecks> {
    let bridgeService = this.createNewType("bridgeService");
    return this.bridgeService.getFederationAddress().then((address: any) => {
      if(address) {
        bridgeService.up = true;
        bridgeService.info = `{FEDERATION_ADDRESS=${address}}`;
        return bridgeService;
      } else {
        throw new Error("Error searching Bridge State");
      }
    }).catch((e) => {
      this.logger.debug(`[healthCheckController] error : ${e}`);
      bridgeService.up = false;
      health.up = false;
      return bridgeService;
    });
  }

  private async getBlockBookInfo(health: HealthInformation): Promise<HealthInformationChecks> {
    let blockBook = this.createNewType("blockBook");
    return this.bitcoinService.getLastBlock().then((info: LastBlockInfo) => {
      if (info) {
        blockBook.up = true;
        blockBook.info = `{LAST_BTC_BLOCK=${info.bestHeight},LAST_BTC_HASH=${info.bestBlockHash},TOTAL_BLOCKS=${info.blocks},CHAIN=${info.chain}, syncing=${info.inSync} }`;
        return blockBook;
      } else {
        throw new Error("Error searching BTC Block Number");
      }
    }).catch((e) => {
      this.logger.debug(`[healthCheckController] error : ${e}`);
      blockBook.up = false;
      health.up = false;
      return blockBook;
    });
  }
  
  private async getRskNodeInfo(health: HealthInformation): Promise<HealthInformationChecks> {
    let rskNode = this.createNewType("rskNode");
    return this.rskNodeService.getBlockNumber().then((blockNumber:number) => {
      if(blockNumber) {
        rskNode.up = true;
        rskNode.info = `{LAST_BLOCK=${blockNumber}}`;
        return rskNode;
      } else {
        throw new Error("Error searching block number");
      }
    }).catch((e) => {
      this.logger.debug(`[healthCheckController] error : ${e}`);
      rskNode.up = false;
      health.up = false;
      return rskNode;
    });
  }

  private async getDataBaseInfo(health: HealthInformation): Promise<HealthInformationChecks> {
    let dataBase = this.createNewType("dataBase");
    return this.syncStorageService.getBestBlock().then((syncStatusModel: SyncStatusModel | undefined) => {
      if(syncStatusModel) {
        dataBase.info = `{LAST_BLOCK=${syncStatusModel.rskBlockHeight},PARENT_BLOCK=${syncStatusModel.rskBlockParentHash}}`;
        dataBase.up = true;
        return dataBase;
      } else {
        throw new Error("Block info not found");
      }
    }).catch((e) => {
      this.logger.debug(`[healthCheckController] error : ${e}`);
      health.up = false;
      dataBase.up = false;
      return dataBase;
    });
  }

  createNewType(name: string) {
    return new HealthInformationChecks(name);
  }

}
