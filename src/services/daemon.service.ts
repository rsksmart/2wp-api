import {getLogger, Logger} from 'log4js';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {SyncStatusModel} from '../models/rsk/sync-status.model';
import {GenericDataService} from './generic-data-service';
import {PeginStatusDataService} from './pegin-status-data-services/pegin-status-data.service';
import {RegisterBtcTransactionDataParser} from './register-btc-transaction-data.parser';
import {RskBridgeDataProvider} from './rsk-bridge-data.provider';

const SYNC_ID: number = 1;

export class DaemonService implements iDaemonService {
  dataProvider: RskBridgeDataProvider;
  peginStatusStorageService: PeginStatusDataService;
  syncStorageService: GenericDataService<SyncStatusModel>;
  registerBtcTransactionDataParser: RegisterBtcTransactionDataParser;

  dataFetchInterval: NodeJS.Timer;
  started: boolean;
  logger: Logger;
  lastSyncLog: number = 0;
  ticking: boolean;
  lastBlock: number;

  intervalTime: number;
  defaultLastBlock: number;
  minDepthToSync: number;

  constructor(
    dataProvider: RskBridgeDataProvider,
    peginStatusStorageService: PeginStatusDataService,
    syncStorageService: GenericDataService<SyncStatusModel>
  ) {
    this.dataProvider = dataProvider;
    this.peginStatusStorageService = peginStatusStorageService;
    this.syncStorageService = syncStorageService;
    this.registerBtcTransactionDataParser = new RegisterBtcTransactionDataParser();

    this.started = false;
    this.logger = getLogger('daemon-service');

    // TODO: add configurations via injection/env variables
    this.intervalTime = 5000;
    this.defaultLastBlock = 1930363;
    this.minDepthToSync = 5;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.logger.trace('Starting');
    await this.peginStatusStorageService.start();
    await this.syncStorageService.start();
    // Get initial sync status
    this.lastBlock = (await this.getSyncStatus()).rskBlockHeight;

    this.configureDataFilters();
    // Start up the daemon
    this.dataFetchInterval = setInterval(() => this.fetch(), this.intervalTime);

    this.logger.debug('Started');
    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.started) {
      this.logger.trace('Stopping');
      clearInterval(this.dataFetchInterval);
      await this.peginStatusStorageService.stop()
      this.started = false;
      this.logger.debug('Stopped');
    }
  }

  private async fetch(): Promise<void> {
    // Avoid processing if the service has not started or was stopped
    if (!this.started) {
      return;
    }
    // Avoid processing more fetches if there is a pending fetch
    if (this.ticking) {
      return;
    }
    this.ticking = true;
    try {
      this.lastSyncLog++;
      if (this.lastSyncLog >= 10) {
        this.lastSyncLog = 0;
        this.logger.trace("Sync status => Last block is " + this.lastBlock);
      }
      let response = await this.dataProvider.getData(this.lastBlock);
      this.lastBlock = response.maxBlockHeight + 1;
      await this.updateSyncStatus();
      for (let tx of response.data) {
        this.logger.debug(`Got tx ${tx.hash}`);
        let peginStatus = this.registerBtcTransactionDataParser.parse(tx);
        if (!peginStatus) {
          this.logger.debug('Transaction is not a registerBtcTransaction or has not registered the peg-in');
          continue;
        }
        try {
          let found = await this.peginStatusStorageService.getPeginStatus(peginStatus.btcTxId);
          if (found) {
            this.logger.debug(`${tx.hash} already registered`);
          } else {
            await this.peginStatusStorageService.setPeginStatus(peginStatus);
          }
        } catch (e) {
          this.logger.warn('There was a problem with the storage', e);
        }
      }
    } catch (error) {
      this.logger.warn('Got an error fetching data', error.message);
    }
    this.ticking = false;
  }

  private configureDataFilters(): void {
    let dataFilters = [];
    // registerBtcTransaction data filter
    dataFilters.push(new BridgeDataFilterModel('43dc0656'));
    this.dataProvider.configure(dataFilters);
  }

  private getSyncStatus(): Promise<SyncStatusModel> {
    return this.syncStorageService.getMany().then(result => {
      if (!result || result.length == 0) {
        let syncStatusModel = new SyncStatusModel();
        syncStatusModel.syncId = SYNC_ID;
        syncStatusModel.rskBlockHeight = this.defaultLastBlock;
        syncStatusModel.lastSyncedOn = new Date();
        return syncStatusModel;
      }
      if (result.length > 1) {
        throw new Error('Multiple sync status found!');
      }
      return result[0];
    });
  }

  private updateSyncStatus(): Promise<boolean> {
    let data = new SyncStatusModel();
    data.syncId = SYNC_ID;
    data.rskBlockHeight = this.lastBlock;
    data.lastSyncedOn = new Date();
    return this.syncStorageService.set(data);
  }
}

export interface iDaemonService {
  start(): void;

  stop(): void;
}
