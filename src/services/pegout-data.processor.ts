import {getLogger, Logger} from 'log4js';
import {RskTransaction} from '../models/rsk/rsk-transaction.model';
import {BRIDGE_METHODS, BRIDGE_EVENTS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import { PegoutStatusDataService } from './pegout-status-data-services/pegout-status-data.service';
import { PegoutStatusDataModel, PegoutStatus } from '../models/rsk/pegout-status-data.model';
import {Log} from '../models/rsk/log.model';

export class PegoutDataProcessor implements FilteredBridgeTransactionProcessor {
  logger: Logger;
  pegoutStatusDataService: PegoutStatusDataService;

  constructor(pegoutStatusDataService: PegoutStatusDataService) {
    this.logger = getLogger('pegoutDataProcessor');
    this.pegoutStatusDataService = pegoutStatusDataService;
  }
  async process(rskTransaction: RskTransaction): Promise<void> {
    this.logger.debug(`[process] Got tx ${rskTransaction.hash}`);
    const pegoutStatus = this.parse(rskTransaction);
    if (!pegoutStatus) {
      this.logger.debug('[process] Transaction is not a registerBtcTransaction or has not registered the peg-out');
      return;
    }

    try {
      const found = await this.pegoutStatusDataService.getById(pegoutStatus.originatingRskTxHash);
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

  private getPegoutStatus(transaction: RskTransaction): PegoutStatusDataModel | undefined {
    this.logger.debug(`[getPegOutStatus] Started with transaction ${transaction}`);
    const status = new PegoutStatusDataModel();
    if (this.hasOnlyThisLog(getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED), transaction.logs)) {
      status.status = PegoutStatus.RECEIVED;
      return status;
    }
    if (this.hasThisLog(getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED), transaction.logs)) {
      status.status = PegoutStatus.REJECTED;
      return status;
    }
  }

  private getThisLogIfFound(logSignature: string, logs: Array<Log>): Log | null {
    for (const log of logs) {
      if (log.topics) {
        for (const topic of log.topics) {
          if (topic == logSignature) {
            return log;
          }
        }
      }
    }
    return null;
  }

  private hasThisLog(logSignature: string, logs: Array<Log>): boolean {
    return this.getThisLogIfFound(logSignature, logs) != null;
  }

  private hasOnlyThisLog(logSignature: string, logs: Array<Log>): boolean {
    for (const log of logs) {
      if (log.topics) {
        for (const topic of log.topics) {
          if (topic != logSignature) {
            return false;
          }
        }
      }
    }
    return true;
  }

  parse(transaction: RskTransaction): PegoutStatusDataModel | null {
    if (!transaction || !transaction.logs || !transaction.logs.length) {
      this.logger.warn(`[parse] This transaction doesn't have the data required to be parsed`);
      return null;
    }
    const result = this.getPegoutStatus(transaction);
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
