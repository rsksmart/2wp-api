import {getLogger, Logger} from 'log4js';
import {BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from './filtered-bridge-transaction-processor';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import ExtendedBridgeTx from './extended-bridge-tx';
import {ExtendedBridgeEvent} from "../models/types/bridge-transaction-parser";

const pegnatoriesData = new Map();

export class PegnatoriesDataProcessor implements FilteredBridgeTransactionProcessor {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('pegnatoriesDataProcessor');
  }

  getFilters(): BridgeDataFilterModel[] {
    return [
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS)),
      BridgeDataFilterModel.EMPTY_DATA_FILTER,
    ];
  }

  async process(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    try {
      this.logger.debug(`[process] Got tx ${extendedBridgeTx.txHash}`);

      const events = extendedBridgeTx.events as ExtendedBridgeEvent[];

      events.forEach(event => {
        pegnatoriesData.set(event.arguments.sender, extendedBridgeTx.createdOn);
        console.log(event)
      });
      console.log(pegnatoriesData)
    } catch (e) {
      this.logger.error(`[process] error processing: ${e}`);
    }
  }
}
