import {getLogger, Logger} from 'log4js';
import {RskTransaction} from '../models/rsk/rsk-transaction.model';
import {BRIDGE_EVENTS, BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import { PegoutStatusDataService } from './pegout-status-data-services/pegout-status-data.service';

export class PegoutDataProcessor implements FilteredBridgeTransactionProcessor {
  logger: Logger;
  pegoutStatusDataService: PegoutStatusDataService;

  constructor(pegoutStatusDataService: PegoutStatusDataService) {
    this.logger = getLogger('pegoutDataProcessor');
    this.pegoutStatusDataService = pegoutStatusDataService;
  }
  async process(rskTransaction: RskTransaction): Promise<void> {
    this.logger.error('[process] Method not yet implemented');
    throw new Error('Method not yet implemented');
  }
  getFilters(): BridgeDataFilterModel[] {
    return [
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS)),
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_EVENTS.RELEASE_BTC)),
      BridgeDataFilterModel.EMPTY_DATA_FILTER
    ];
  }
}
