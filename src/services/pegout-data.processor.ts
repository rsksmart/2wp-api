import {getLogger, Logger} from 'log4js';
import {BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import { PegoutStatusDataService } from './pegout-status-data-services/pegout-status-data.service';
import ExtendedBridgeTx from './extended-bridge-tx';

export class PegoutDataProcessor implements FilteredBridgeTransactionProcessor {
  logger: Logger;
  pegoutStatusDataService: PegoutStatusDataService;

  constructor(pegoutStatusDataService: PegoutStatusDataService) {
    this.logger = getLogger('pegoutDataProcessor');
    this.pegoutStatusDataService = pegoutStatusDataService;
  }
  async process(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    this.logger.error('[process] Method not yet implemented');
    throw new Error('Method not yet implemented');
  }
  getFilters(): BridgeDataFilterModel[] {
    // TODO: add BRIDGE_METHODS.RELEASE_BTC = 'releaseBtc' when this method is available in the bridge abis.
    return [
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS)),
      BridgeDataFilterModel.EMPTY_DATA_FILTER
    ];
  }
}
