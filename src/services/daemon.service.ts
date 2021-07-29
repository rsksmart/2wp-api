import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {ConstantsBindings, DatasourcesBindings, ServicesBindings} from '../dependency-injection-bindings';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {RskBlock} from '../models/rsk/rsk-block.model';
import {getMetricLogger} from '../utils/metric-logger';
import {PeginStatusDataService} from './pegin-status-data-services/pegin-status-data.service';
import {RegisterBtcTransactionDataParser} from './register-btc-transaction-data.parser';
import {RskBridgeDataProvider} from './rsk-bridge-data.provider';
import {RskChainSyncService} from './rsk-chain-sync.service';

export class DaemonService implements iDaemonService {
  dataProvider: RskBridgeDataProvider;
  peginStatusStorageService: PeginStatusDataService;
  syncService: RskChainSyncService;
  registerBtcTransactionDataParser: RegisterBtcTransactionDataParser;

  dataFetchInterval: NodeJS.Timer;
  started: boolean;
  logger: Logger;

  intervalTime: number;
  lastSyncLog: number = 0;

  constructor(
    @inject(DatasourcesBindings.RSK_BRIDGE_DATA_PROVIDER)
    dataProvider: RskBridgeDataProvider,
    @inject(ServicesBindings.PEGIN_STATUS_DATA_SERVICE)
    peginStatusStorageService: PeginStatusDataService,
    @inject(ServicesBindings.RSK_CHAIN_SYNC_SERVICE)
    syncService: RskChainSyncService,
    @inject(ConstantsBindings.SYNC_INTERVAL_TIME)
    syncIntervalTime: string | undefined
  ) {
    this.dataProvider = dataProvider;
    this.peginStatusStorageService = peginStatusStorageService;
    this.syncService = syncService;
    this.registerBtcTransactionDataParser = new RegisterBtcTransactionDataParser();

    this.started = false;
    this.logger = getLogger('daemon-service');

    this.intervalTime = parseInt(syncIntervalTime || '2000');
  }

  private async handleNewBestBlock(block: RskBlock): Promise<void> {
    // TODO: refactor data fetching to avoid getting the block again
    try {
      let response = await this.dataProvider.getData(block.height);
      for (let tx of response.data) {
        this.logger.debug(`Got tx ${tx.hash}`);
        let peginStatus = this.registerBtcTransactionDataParser.parse(tx);
        if (!peginStatus) {
          this.logger.debug('Transaction is not a registerBtcTransaction or has not registered the peg-in');
          continue;
        }
        try {
          let found = await this.peginStatusStorageService.getById(peginStatus.btcTxId);
          if (found) {
            this.logger.debug(`${tx.hash} already registered`);
          } else {
            await this.peginStatusStorageService.set(peginStatus);
          }
        } catch (e) {
          this.logger.warn('There was a problem with the storage', e);
        }
      }
    } catch (e) {
      this.logger.warn('There was a problem handling the new block', e);
    }
  }

  private async handleDeleteBlock(block: RskBlock): Promise<void> {
    try {
      await this.peginStatusStorageService.deleteByRskBlockHeight(block.height);
    } catch (e) {
      this.logger.warn('There was a problem handling the deleted block', e);
    }
  }

  private startTimer(): void {
    this.dataFetchInterval = setTimeout(() => this.sync(), this.intervalTime);
  }

  private async sync(): Promise<void> {
    // Avoid processing if the service has not started or was stopped
    if (!this.started) {
      this.startTimer();
      return;
    }
    let logMetrics = getMetricLogger(this.logger, 'sync');
    try {
      this.lastSyncLog++;
      if (this.lastSyncLog >= 5) {
        this.lastSyncLog = 0;
        let bestBlock = await this.syncService.getSyncStatus();
        this.logger.debug(`Sync status => Best block is ${bestBlock.rskBlockHeight}[${bestBlock.rskBlockHash}]`);
      }
      await this.syncService.sync();
    } catch (error) {
      this.logger.warn('Got an error syncing', error.message);
    }
    logMetrics();
    this.startTimer();
  }

  private configureDataFilters(): void {
    let dataFilters = [];
    // registerBtcTransaction data filter
    // TODO: THIS SHOULD USE THE PRECOMPILED ABIS
    dataFilters.push(new BridgeDataFilterModel('43dc0656'));
    this.dataProvider.configure(dataFilters);
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.logger.trace('Starting');
    await this.peginStatusStorageService.start();

    await this.syncService.start();
    this.syncService.subscribe({
      blockAdded: (block) => this.handleNewBestBlock(block),
      blockDeleted: (block) => this.handleDeleteBlock(block)
    });

    this.configureDataFilters();

    this.logger.debug('Started');
    this.started = true;

    // Schedule daemon task
    this.startTimer();
  }

  public async stop(): Promise<void> {
    if (this.started) {
      this.started = false;
      this.logger.trace('Stopping');
      clearInterval(this.dataFetchInterval);
      await this.peginStatusStorageService.stop()
      await this.syncService.stop();
      this.logger.debug('Stopped');
    }
  }

}

export interface iDaemonService {
  start(): void;

  stop(): void;
}
