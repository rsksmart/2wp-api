import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {PeginStatus as RskPeginStatusEnum, PeginStatusDataModel} from '../models/rsk/pegin-status-data.model';
import {BRIDGE_EVENTS, BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import {PeginStatusDataService} from './pegin-status-data-services/pegin-status-data.service';
import {ServicesBindings} from '../dependency-injection-bindings';
import ExtendedBridgeTx from './extended-bridge-tx';
import {BridgeEvent} from 'bridge-transaction-parser';
import {ExtendedBridgeEvent} from "../models/types/bridge-transaction-parser";

export class PeginDataProcessor implements FilteredBridgeTransactionProcessor {
  peginStatusStorageService: PeginStatusDataService;
  logger: Logger;
  constructor(@inject(ServicesBindings.PEGIN_STATUS_DATA_SERVICE)
  peginStatusStorageService: PeginStatusDataService,) {
    this.logger = getLogger('peginDataProcessor');
    this.peginStatusStorageService = peginStatusStorageService;
  }

  async process(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    this.logger.debug(`[process] Got tx ${extendedBridgeTx.txHash}`);
    const peginStatus = this.parse(extendedBridgeTx);
    if (!peginStatus) {
      this.logger.debug('[process] Transaction is not a registerBtcTransaction or has not registered the peg-in');
      return;
    }
    try {
      const found = await this.peginStatusStorageService.getById(peginStatus.btcTxId);
      if (found) {
        return this.logger.debug(`[process] ${extendedBridgeTx.txHash} already registered`);
      }
      await this.peginStatusStorageService.set(peginStatus);
      this.logger.trace(`[process] ${extendedBridgeTx.txHash} registered`);
    } catch (e) {
      this.logger.warn('[process] There was a problem with the storage', e);
    }
  }

  getFilters(): BridgeDataFilterModel[] {
    return [new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.REGISTER_BTC_TRANSACTION))];
  }

  private hasThisLog(logName: string, events: BridgeEvent[]): boolean {
    return events.some(event => event.name === logName);
  }

  private getPeginStatus(extendedBridgeTx: ExtendedBridgeTx): PeginStatusDataModel | undefined {
    this.logger.debug(`[getPeginStatus] Started with transaction ${extendedBridgeTx}`);
    const status = new PeginStatusDataModel();
    if (this.hasThisLog(BRIDGE_EVENTS.LOCK_BTC, extendedBridgeTx.events)) {
      const lockBtcLog = this.getLockBtcLogIfExists(extendedBridgeTx.events as ExtendedBridgeEvent[]);
      if(lockBtcLog) {
        status.btcTxId = <string> lockBtcLog.arguments.btcTxHash;
        const rskReceiver = <string> lockBtcLog.arguments.receiver;
        status.rskRecipient = rskReceiver.toLowerCase();
      }
      status.status = RskPeginStatusEnum.LOCKED;
      return status;
    }
    const peginBtcLog = this.getPeginBtcLogIfExists(extendedBridgeTx.events as ExtendedBridgeEvent[]);
    if (peginBtcLog) {
      const rskReceiver = <string> peginBtcLog.arguments.receiver;
      status.rskRecipient = rskReceiver.toLowerCase();
      status.btcTxId = <string> peginBtcLog.arguments.btcTxHash;
      status.status = RskPeginStatusEnum.LOCKED;
      return status;
    }
    if (this.hasThisLog(BRIDGE_EVENTS.REJECTED_PEGIN, extendedBridgeTx.events)) {
      const rejectedPeginLog: ExtendedBridgeEvent = extendedBridgeTx.events.find(event => event.name === BRIDGE_EVENTS.REJECTED_PEGIN) as ExtendedBridgeEvent;
      status.btcTxId = <string> rejectedPeginLog?.arguments.btcTxHash;
      if (this.hasThisLog(BRIDGE_EVENTS.RELEASE_REQUESTED, extendedBridgeTx.events)) {
        status.status = RskPeginStatusEnum.REJECTED_REFUND;
        return status;
      }
      if (this.hasThisLog(BRIDGE_EVENTS.UNREFUNDABLE_PEGIN, extendedBridgeTx.events)) {
        status.status = RskPeginStatusEnum.REJECTED_NO_REFUND;
        return status;
      }
      // TODO: THIS SHOULD NOT HAPPEN, LOG IT IF IT EVER DOES
    }

  }

  private getPeginBtcLogIfExists(events: ExtendedBridgeEvent[]): ExtendedBridgeEvent | undefined {
    return events.find(event => event.name === BRIDGE_EVENTS.PEGIN_BTC);
  }

  private getLockBtcLogIfExists(events: ExtendedBridgeEvent[]): ExtendedBridgeEvent | undefined {
    return events.find(event => event.name === BRIDGE_EVENTS.LOCK_BTC);
  }

  parse(extendedBridgeTx: ExtendedBridgeTx): PeginStatusDataModel | null {
    if (!extendedBridgeTx || !extendedBridgeTx.events || !extendedBridgeTx.events.length) {
      this.logger.warn(`[parse] This transaction doesn't have the data required to be parsed`);
      return null;
    }
    const result = this.getPeginStatus(extendedBridgeTx);
    if (!result) {
      return null;
    }

    result.rskTxId = extendedBridgeTx.txHash;
    result.rskBlockHeight = extendedBridgeTx.blockNumber;
    result.createdOn = extendedBridgeTx.createdOn;

    return result;
  }

}
