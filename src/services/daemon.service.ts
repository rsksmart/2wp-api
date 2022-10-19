import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {ConstantsBindings, ServicesBindings} from '../dependency-injection-bindings';
import {RskBlock} from '../models/rsk/rsk-block.model';
import {getMetricLogger} from '../utils/metric-logger';
import {PeginStatusDataService} from './pegin-status-data-services/pegin-status-data.service';
import {PeginDataProcessor} from './pegin-data.processor';
import {PegoutDataProcessor} from './pegout-data.processor';
import {RskChainSyncService} from './rsk-chain-sync.service';
import RskBlockProcessorPublisher from './rsk-block-processor-publisher';

export class DaemonService implements iDaemonService {
  peginStatusStorageService: PeginStatusDataService;

  syncService: RskChainSyncService;

  peginDataProcessor: PeginDataProcessor;

  pegoutDataProcessor: PegoutDataProcessor;

  rskBlockProcessorPublisher: RskBlockProcessorPublisher

  dataFetchInterval: NodeJS.Timer;

  started: boolean;

  logger: Logger;

  intervalTime: number;

  lastSyncLog = 0;

  constructor(
    @inject(ServicesBindings.RSK_BLOCK_PROCESSOR_PUBLISHER)
      rskBlockProcessorPublisher: RskBlockProcessorPublisher,
    @inject(ServicesBindings.PEGIN_STATUS_DATA_SERVICE)
      peginStatusStorageService: PeginStatusDataService,
    @inject(ServicesBindings.RSK_CHAIN_SYNC_SERVICE)
      syncService: RskChainSyncService,
    @inject(ConstantsBindings.SYNC_INTERVAL_TIME)
      syncIntervalTime: string | undefined,
    @inject(ServicesBindings.PEGIN_DATA_PROCESSOR)
      peginDataProcessor: PeginDataProcessor,
    @inject(ServicesBindings.PEGOUT_DATA_PROCESSOR)
      pegoutDataProcessor: PegoutDataProcessor,
  ) {
    this.peginStatusStorageService = peginStatusStorageService;
    this.syncService = syncService;
    this.peginDataProcessor = peginDataProcessor;
    this.pegoutDataProcessor = pegoutDataProcessor;
    this.rskBlockProcessorPublisher = rskBlockProcessorPublisher;
    this.started = false;
    this.logger = getLogger('daemon-service');
    this.intervalTime = parseInt(syncIntervalTime || '2000');
  }

  private async handleNewBestBlock(rskBlock: RskBlock): Promise<void> {
    try {
      await this.rskBlockProcessorPublisher.process(rskBlock);
    } catch (e) {
      this.logger.warn('There was a problem handling the new block', e);
    }
  }

  private async handleDeleteBlock(block: RskBlock): Promise<void> {
    try {
      await this.peginStatusStorageService.deleteByRskBlockHeight(block.height);
      await this.pegoutDataProcessor.deleteByRskBlockHeight(block.height);
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
    const logMetrics = getMetricLogger(this.logger, 'sync');
    try {
      this.lastSyncLog += 1;
      if (this.lastSyncLog >= 5) {
        this.lastSyncLog = 0;
        const bestBlock = await this.syncService.getSyncStatus();
        this.logger.debug(`Sync status => Best block is 
          ${bestBlock.rskBlockHeight}[${bestBlock.rskBlockHash}]`);
      }
      await this.syncService.sync();
    } catch (error) {
      this.logger.warn('Got an error syncing', error.message);
    }
    logMetrics();
    this.startTimer();
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
      blockDeleted: (block) => this.handleDeleteBlock(block),
    });

    this.rskBlockProcessorPublisher.addSubscriber(this.peginDataProcessor);
    this.rskBlockProcessorPublisher.addSubscriber(this.pegoutDataProcessor);

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
      this.rskBlockProcessorPublisher.removeSubscriber(this.peginDataProcessor);
      this.logger.debug('Stopped');
    }
  }

}

// eslint-disable-next-line @typescript-eslint/naming-convention
export interface iDaemonService {
  start(): void;

  stop(): void;
}
