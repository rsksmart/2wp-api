import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {Log} from '../models/rsk/log.model';
import {PeginStatus as RskPeginStatusEnum, PeginStatusDataModel} from '../models/rsk/pegin-status-data.model';
import {RskTransaction} from '../models/rsk/rsk-transaction.model';
import {BRIDGE_EVENTS, BRIDGE_METHODS, decodeBridgeMethodParameters, getBridgeSignature} from '../utils/bridge-utils';
import {calculateBtcTxHash} from '../utils/btc-utils';
import {ensure0x} from '../utils/hex-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import {PeginStatusDataService} from './pegin-status-data-services/pegin-status-data.service';
import {ServicesBindings} from '../dependency-injection-bindings';
export class PeginDataProcessor implements FilteredBridgeTransactionProcessor {
  peginStatusStorageService: PeginStatusDataService;
  logger: Logger;
  constructor(@inject(ServicesBindings.PEGIN_STATUS_DATA_SERVICE)
  peginStatusStorageService: PeginStatusDataService,) {
    this.logger = getLogger('peginDataProcessor');
    this.peginStatusStorageService = peginStatusStorageService;
  }

  async process(rskTransaction: RskTransaction): Promise<void> {
    console.log("PeginDataProcessor::process rskTransaction: ", rskTransaction)
    this.logger.debug(`[process] Got tx ${rskTransaction.hash}`);
    const peginStatus = this.parse(rskTransaction);
    console.log("PeginDataProcessorvprocess peginStatus: ", peginStatus)
    if (!peginStatus) {
      this.logger.debug('[process] Transaction is not a registerBtcTransaction or has not registered the peg-in');
      return;
    }
    try {
      const found = await this.peginStatusStorageService.getById(peginStatus.btcTxId);
      console.log("PeginDataProcessor::process found: ", found)
      if (found) {
        return this.logger.debug(`[process] ${rskTransaction.hash} already registered`);
      }

      console.log("PeginDataProcessor::process saving peginStatus: ")
      await this.peginStatusStorageService.set(peginStatus);
      
    } catch (e) {
      this.logger.warn('[process] There was a problem with the storage', e);
    }
  }

  getFilters(): BridgeDataFilterModel[] {
    return [new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION))];
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

  private getbtcTxId(data: string): string {
    const decodedParameters = decodeBridgeMethodParameters(
      BRIDGE_METHODS.REGISTER_BTC_TRANSACTION,
      ensure0x(data.substr(10))
    );
    // Calculate btc tx id
    return ensure0x(calculateBtcTxHash(decodedParameters.tx));
  }

  private getPeginStatus(transaction: RskTransaction): PeginStatusDataModel | undefined {
    this.logger.debug(`[getPeginStatus] Started with transaction ${transaction}`);
    const status = new PeginStatusDataModel();
    if (this.hasThisLog(getBridgeSignature(BRIDGE_EVENTS.LOCK_BTC), transaction.logs)) {
      // TODO: recipient cannot be determined with the log, it requires parsing the first input's sender
      status.status = RskPeginStatusEnum.LOCKED;
      return status;
    }
    const peginBtcLog = this.getPeginBtcLogIfExists(transaction.logs);
    if (peginBtcLog) {
      status.rskRecipient = ensure0x(peginBtcLog.topics[1].slice(- 40));
      status.status = RskPeginStatusEnum.LOCKED;
      return status;
    }
    if (this.hasThisLog(getBridgeSignature(BRIDGE_EVENTS.REJECTED_PEGIN), transaction.logs)) {
      if (this.hasThisLog(getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUESTED), transaction.logs)) {
        status.status = RskPeginStatusEnum.REJECTED_REFUND;
        return status;
      }
      if (this.hasThisLog(getBridgeSignature(BRIDGE_EVENTS.UNREFUNDABLE_PEGIN), transaction.logs)) {
        status.status = RskPeginStatusEnum.REJECTED_NO_REFUND;
        return status;
      }
      // TODO: THIS SHOULD NOT HAPPEN, LOG IT IF IT EVER DOES
    }

  }

  private getPeginBtcLogIfExists(logs: Array<Log>): Log | null {
    return this.getThisLogIfFound(getBridgeSignature(BRIDGE_EVENTS.PEGIN_BTC), logs);
  }

  parse(transaction: RskTransaction): PeginStatusDataModel | null {
    if (!transaction || !transaction.logs || !transaction.logs.length) {
      this.logger.warn(`[parse] This transaction doesn't have the data required to be parsed`);
      return null;
    }
    const result = this.getPeginStatus(transaction);
    if (!result) {
      return null;
    }
    result.rskTxId = transaction.hash;
    result.rskBlockHeight = transaction.blockHeight;
    result.createdOn = transaction.createdOn;
    result.btcTxId = this.getbtcTxId(transaction.data);

    return result;
  }

}
