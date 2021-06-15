import {getLogger, Logger} from 'log4js';
import {PeginStatusDataModel} from '../models/rsk/pegin.status-data.model';
import {PeginStatusDataService} from './pegin-status-data.service';
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

  start(): void {
    if (this.started) {
      return;
    }
    this.logger.info('Starting');
    this.started = true;
    // Start up the daemon
    this.dataFetchInterval = setInterval(() => this.fetch(), this.intervalTime);
  }

  stop(): void {
    if (this.started) {
      clearInterval(this.dataFetchInterval);
      this.started = false;
      this.logger.info('Stopped');
    }
  }

  async fetch(): Promise<void> {
    try {
      let response = await this.dataProvider.getData(this.lastBlock);
      this.logger.debug(`Got ${response.data.length} transactions. Max block ${response.maxBlockHeight}`);
      // TODO: I should get the next block to search... ?
      this.lastBlock = response.maxBlockHeight + 1;
      for (let tx of response.data) {
        this.logger.debug(`Got tx ${tx.hash}`);
        let peginStatus = new PeginStatusDataModel();
        peginStatus.btcTxId = 'test' + tx.blockHeight;
        peginStatus.rskTxId = tx.hash.toString('hex');
        peginStatus.rskBlockHeight = tx.blockHeight;
        await this.storageService.setPeginStatus(peginStatus);

        await this.storageService.getPeginStatus('test' + tx.blockHeight)
      }
      // TODO: handle response
    } catch (error) {
      this.logger.warn('Got an error fetching data', error.message);
    }
  }
}

export interface iDaemonService {
  start(): void;

  stop(): void;
}
