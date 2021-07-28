import {getLogger, Logger} from 'log4js';
import {PeginStatusDataModel} from '../../models/rsk/pegin-status-data.model';

export interface PeginStatusDataService {
  getPeginStatus(btcTxId: string): Promise<PeginStatusDataModel>;
  setPeginStatus(data: PeginStatusDataModel): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export class PeginStatusDataServiceMemoryImplementation implements PeginStatusDataService {

  dataSource: Map<string, PeginStatusDataModel>;
  logger: Logger;
  constructor() {
    this.dataSource = new Map();
    this.logger = getLogger('peginStatusDataService');
  }

  getPeginStatus(btcTxId: string): Promise<PeginStatusDataModel> {
    this.logger.trace(`Searching for ${btcTxId}`);
    let result = this.dataSource.get(btcTxId);
    if (result) {
      this.logger.trace('got it');
      return Promise.resolve(result);
    }
    this.logger.trace('does not exist');
    throw new Error(`tx not found in storage. txid => ${btcTxId}`);
  }

  setPeginStatus(data: PeginStatusDataModel) {
    this.dataSource.set(data.btcTxId, data);
    return Promise.resolve();
  }

  start(): Promise<void> {
    this.logger.debug('Starting');
    return Promise.resolve();
  }

  stop(): Promise<void> {
    this.logger.debug('Stopping');
    return Promise.resolve();
  }
}
