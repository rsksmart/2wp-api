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
      this.logger.debug('[process] Transaction is not a registerBtcTransaction or fails to register the peg-in');
      return;
    }
    try {
      const found = await this.peginStatusStorageService.getById(peginStatus.btcTxId);
      if (found) {
        return this.logger.debug(`[process] ${extendedBridgeTx.txHash} already registered`);
      }
      await this.peginStatusStorageService.set(peginStatus);
      this.logger.info(`[process] ${extendedBridgeTx.txHash} registered. data: [btctxid:${peginStatus.btcTxId}] [status${peginStatus.status}]`);
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
    this.logger.debug(`[getPeginStatus] Started with transaction ${extendedBridgeTx.txHash}`);
    const status = new PeginStatusDataModel();
    if (this.hasThisLog(BRIDGE_EVENTS.LOCK_BTC, extendedBridgeTx.events)) {
      const lockBtcLog = this.getLockBtcLogIfExists(extendedBridgeTx.events as ExtendedBridgeEvent[]);
      if(lockBtcLog) {
        status.btcTxId = <string> lockBtcLog.arguments.btcTxHash;
        const rskReceiver = <string> lockBtcLog.arguments.receiver;
        status.rskRecipient = rskReceiver.toLowerCase();
      }
      //
      status.status = RskPeginStatusEnum.LOCKED;

      this.getLoggerContextInformation(status);
      this.logger.trace(`[getPeginStatus] New PegIn locked with amount: ${lockBtcLog?.arguments.amount}.`);
      // 60 & 63 lines shouldnt be inside the "if" condition?
      
      return status;
    }
    const peginBtcLog = this.getPeginBtcLogIfExists(extendedBridgeTx.events as ExtendedBridgeEvent[]);
    if (peginBtcLog) {

      // we should modify this log to be reachable by grafana since it is not reachable from getLoggerContextInformation.
      this.logger.trace(`[getPeginStatus] New PegIn received with amount: ${peginBtcLog.arguments.amount}.`);
      
      const rskReceiver = <string> peginBtcLog.arguments.receiver;
      status.rskRecipient = rskReceiver.toLowerCase();
      status.btcTxId = <string> peginBtcLog.arguments.btcTxHash;
      status.status = RskPeginStatusEnum.LOCKED;

      this.getLoggerContextInformation(status);
      this.logger.trace(`[getPeginStatus] New PegIn locked with amount: ${peginBtcLog.arguments.amount}.`);
      
      return status;
    }
    if (this.hasThisLog(BRIDGE_EVENTS.REJECTED_PEGIN, extendedBridgeTx.events)) {
      const rejectedPeginLog: ExtendedBridgeEvent = extendedBridgeTx.events.find(event => event.name === BRIDGE_EVENTS.REJECTED_PEGIN) as ExtendedBridgeEvent;
      status.btcTxId = <string> rejectedPeginLog?.arguments.btcTxHash;

      // TODO: this.logger.trace(`[getPeginStatus] New PegIn rejected with amount: ${amount}.`);
      this.getLoggerContextInformation(status);
      this.logger.trace(`[getPeginStatus] New PegIn rejected.`);
      
      if (this.hasThisLog(BRIDGE_EVENTS.RELEASE_REQUESTED, extendedBridgeTx.events)) {
        status.status = RskPeginStatusEnum.REJECTED_REFUND;
        // TODO: this.logger.trace(`[getPeginStatus] New PegIn rejected with amount: ${amount} will be refund.`);
        this.getLoggerContextInformation(status);
        this.logger.trace(`[getPeginStatus] New PegIn rejected will be refund.`);
        return status;
      }
      if (this.hasThisLog(BRIDGE_EVENTS.UNREFUNDABLE_PEGIN, extendedBridgeTx.events)) {
        status.status = RskPeginStatusEnum.REJECTED_NO_REFUND;
        // TODO: this.logger.trace(`[getPeginStatus] New PegIn rejected with amount: ${amount} is unrefundable.`);
        this.getLoggerContextInformation(status);
        this.logger.trace(`[getPeginStatus] New PegIn rejected is unrefundable.`);
        return status;
      }
      this.logger.warn(`[getPeginStatus] Call to RegisterBtcTransaction with invalid data! [rsktxid:${extendedBridgeTx.txHash}]`);
    }

  }

  private getPeginBtcLogIfExists(events: ExtendedBridgeEvent[]): ExtendedBridgeEvent | undefined {
    return events.find(event => event.name === BRIDGE_EVENTS.PEGIN_BTC);
  }

  private getLockBtcLogIfExists(events: ExtendedBridgeEvent[]): ExtendedBridgeEvent | undefined {
    return events.find(event => event.name === BRIDGE_EVENTS.LOCK_BTC);
  }

  private getLoggerContextInformation(pegin: PeginStatusDataModel) {
    try {
      this.logger.trace(`[getLoggerContextInformation] ${JSON.stringify(pegin.status)}`);
    }
    catch(e) {
      this.logger.error('[getLoggerContextInformation] There was a problem with the conversion of pegin.', e);
    }
  }

  parse(extendedBridgeTx: ExtendedBridgeTx): PeginStatusDataModel | null {
    if (!extendedBridgeTx || !extendedBridgeTx.events || !extendedBridgeTx.events.length) {
      this.logger.debug(`[parse] This transaction doesn't have the data required to be parsed`);
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
