import {getLogger, Logger} from 'log4js';
import {PeginStatusDataModel} from '../models/rsk/pegin-status-data.model';
import {PeginStatusDataService} from './pegin-status-data-services/pegin-status-data.service';
import {RskBridgeDataProvider} from './rsk-bridge-data.provider';

export class DaemonService implements iDaemonService {
  dataProvider: RskBridgeDataProvider;
  storageService: PeginStatusDataService
  dataFetchInterval: NodeJS.Timer;
  intervalTime: number;
  started: boolean;
  logger: Logger;
  lastBlock: string | number;
  constructor(
    dataProvider: RskBridgeDataProvider,
    storageService: PeginStatusDataService
  ) {
    this.dataProvider = dataProvider;
    this.storageService = storageService;

    this.started = false;
    // TODO: add configurations via injection/env variables
    this.intervalTime = 3000;
    this.logger = getLogger('daemon-service');
    this.lastBlock = 1930013;
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }
    this.logger.trace('Starting');
    await this.storageService.start();
    // Start up the daemon
    this.dataFetchInterval = setInterval(() => this.fetch(), this.intervalTime);
    this.logger.debug('Started');
    this.started = true;
  }

  async stop(): Promise<void> {
    if (this.started) {
      this.logger.trace('Stopping');
      clearInterval(this.dataFetchInterval);
      await this.storageService.stop()
      this.started = false;
      this.logger.debug('Stopped');
    }
  }

  private async fetch(): Promise<void> {
    if (!this.started) {
      return;
    }
    try {
      let response = await this.dataProvider.getData(this.lastBlock);
      this.logger.debug(`Got ${response.data.length} transactions. Max block ${response.maxBlockHeight}`);
      // TODO: I should get the next block to search... ?
      this.lastBlock = response.maxBlockHeight + 1;
      for (let tx of response.data) {
        this.logger.debug(`Got tx ${tx.hash}`);
        let peginStatus = this.parsePeginTxData(tx);
        try {
          let found = await this.storageService.getPeginStatus(peginStatus.btcTxId);
          if (found) {
            this.logger.debug(`${tx.hash} already registered`);
          } else {
            await this.storageService.setPeginStatus(peginStatus);
          }
        } catch (e) {
          this.logger.warn('There was a problem with the storage', e);
        }
      }
    } catch (error) {
      this.logger.warn('Got an error fetching data', error.message);
    }
  }

  private parsePeginTxData(tx: any): PeginStatusDataModel {
    // TODO: parse the data properly
    let peginStatus = new PeginStatusDataModel();
    peginStatus.btcTxId = tx.hash.toString('hex');
    peginStatus.rskTxId = tx.hash.toString('hex');
    peginStatus.rskBlockHeight = tx.blockHeight;
    peginStatus.createdOn = new Date();
    peginStatus.status = 'test';
    peginStatus.rskRecipient = 'TEST ADDRESS';
    return peginStatus;
  }
}

export interface iDaemonService {
  start(): void;

  stop(): void;
}
