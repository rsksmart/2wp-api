import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from './filtered-bridge-transaction-processor';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import ExtendedBridgeTx from './extended-bridge-tx';
import {ExtendedBridgeEvent} from '../models/types/bridge-transaction-parser';
import {ServicesBindings} from '../dependency-injection-bindings';
import {PegnatoriesStatusDataService} from './pegnatories-status-data-services/pegnatories-status-data.service';
import {PegnatoriesStatusDataModel} from '../models/rsk/pegnatories-status-data.model';

export class PegnatoriesDataProcessor implements FilteredBridgeTransactionProcessor {
  private logger: Logger;
  private pegnatoriesStatusDataService: PegnatoriesStatusDataService;

  constructor(
    @inject(ServicesBindings.PEGNATORIES_STATUS_DATA_SERVICE)
    pegnatoriesStatusDataService: PegnatoriesStatusDataService)
  {
    this.logger = getLogger('pegnatoriesDataProcessor');
    this.pegnatoriesStatusDataService = pegnatoriesStatusDataService;
  }

  getFilters(): BridgeDataFilterModel[] {
    return [
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS))
    ];
  }

  async process(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    try {
      this.logger.debug(`[process] Got tx ${extendedBridgeTx.txHash}`);

      const events = extendedBridgeTx.events as ExtendedBridgeEvent[];

      events.forEach(event => {
        const pegnatoryData = new PegnatoriesStatusDataModel(
          extendedBridgeTx.txHash,
          extendedBridgeTx.blockNumber,
          extendedBridgeTx.blockHash,
          event.arguments.sender,
          event.signature,
          extendedBridgeTx.createdOn
        );
        this.pegnatoriesStatusDataService.set(pegnatoryData);
      });
    } catch (e) {
      this.logger.error(`[process] error processing: ${e}`);
    }
  }
}
