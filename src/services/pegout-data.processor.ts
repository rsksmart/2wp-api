import {getLogger, Logger} from 'log4js';
import {inject} from '@loopback/core';
import {RskTransaction} from '../models/rsk/rsk-transaction.model';
import {BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import { PegoutStatusDataService } from './pegout-status-data-services/pegout-status-data.service';
import { PegoutStatusDataModel } from '../models/rsk/pegout-status-data.model';
import { PegoutStatusService } from './pegout-status/pegout-status-utils';
import {ServicesBindings} from '../dependency-injection-bindings';

export class PegoutDataProcessor implements FilteredBridgeTransactionProcessor {
  pegoutStatusService: PegoutStatusService;
  pegoutStatusDataService: PegoutStatusDataService;
  logger: Logger;

  constructor(
    @inject(ServicesBindings.PEGOUT_STATUS_SERVICE)
    pegoutStatusService: PegoutStatusService,
    pegoutStatusDataService: PegoutStatusDataService)
 {
    this.logger = getLogger('pegoutDataProcessor');
    this.pegoutStatusDataService = pegoutStatusDataService;
    this.pegoutStatusService = pegoutStatusService;
  }
  async process(rskTransaction: RskTransaction): Promise<void> {
    this.logger.debug(`[process] Got tx ${rskTransaction.hash}`);
    const pegoutStatus = this.parse(rskTransaction);
    if (!pegoutStatus) {
      this.logger.debug('[process] Transaction is not a peg-out');
      return;
    }

    try {
      const found = await this.pegoutStatusDataService.getById(pegoutStatus.rskTxHash);
      if (found) {
        return this.logger.debug(`[process] ${rskTransaction.hash} already registered`);
      }
      await this.pegoutStatusDataService.set(pegoutStatus);
      this.logger.trace(`[process] ${rskTransaction.hash} registered`);
    } catch (e) {
      this.logger.warn('[process] There was a problem with the storage', e);
    }
  }

  getFilters(): BridgeDataFilterModel[] {
    return [
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS)),
      BridgeDataFilterModel.EMPTY_DATA_FILTER
    ];
  }

  parse(transaction: RskTransaction): PegoutStatusDataModel | null {
    if (!transaction || !transaction.logs || !transaction.logs.length) {
      this.logger.warn(`[parse] This transaction doesn't have the data required to be parsed`);
      return null;
    }
    const result = this.pegoutStatusService.searchStatus(transaction);
    if (!result) {
      return null;
    }
    result.originatingRskTxHash = transaction.hash;
    result.rskBlockHeight = transaction.blockHeight;
    result.lastUpdatedOn = transaction.createdOn;
    result.rskTxHash = transaction.hash; // this.getbtcTxId(transaction.data);

    return result;
  }

}
