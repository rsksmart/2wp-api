import {getLogger, Logger} from 'log4js';
import {BRIDGE_EVENTS, BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import { PegoutStatusDataService } from './pegout-status-data-services/pegout-status-data.service';
import ExtendedBridgeTx from './extended-bridge-tx';
import { PegoutStatus, PegoutStatusDataModel } from '../models/rsk/pegout-status-data-model';
import { BridgeEvent } from 'bridge-transaction-parser';

export class PegoutDataProcessor implements FilteredBridgeTransactionProcessor {
  private logger: Logger;
  private pegoutStatusDataService: PegoutStatusDataService;

  constructor(pegoutStatusDataService: PegoutStatusDataService) {
    this.logger = getLogger('pegoutDataProcessor');
    this.pegoutStatusDataService = pegoutStatusDataService;
  }
  async process(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    
    const events: BridgeEvent[] = extendedBridgeTx.events;

    if(this.hasReleaseRequestReceivedEvent(events)) {
      this.logger.trace('[process] found a release_request_received event. Processing...');
      return this.processReleaseRequestReceivedStatus(extendedBridgeTx);
    }

    if(this.hasReleaseRequestRejectedEvent(events)) {
      this.logger.trace('[process] found a release_request_rejected event. Processing...');
      return this.processReleaseRequestRejectedStatus(extendedBridgeTx);
    }

    this.logger.warn('[process] other statuses processing not yet implemented.');

  }

  getFilters(): BridgeDataFilterModel[] {
    // TODO: add BRIDGE_METHODS.RELEASE_BTC = 'releaseBtc' when this method is available in the bridge abis.
    return [
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS)),
      BridgeDataFilterModel.EMPTY_DATA_FILTER
    ];
  }

  hasReleaseRequestReceivedEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);
  }

  hasReleaseRequestRejectedEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);
  }

  private processReleaseRequestReceivedStatus(extendedBridgeTx: ExtendedBridgeTx): void {

    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseRequestReceivedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);

    if(!releaseRequestReceivedEvent) {
      return;
    }

    const rskSenderAddress = <string> releaseRequestReceivedEvent.arguments.get('sender');
    const btcDestinationAddress = <string> releaseRequestReceivedEvent.arguments.get('btcDestinationAddress');
    const amount = <string> releaseRequestReceivedEvent.arguments.get('amount');

    const status: PegoutStatusDataModel = new PegoutStatusDataModel();

    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = rskSenderAddress;
    status.btcRecipientAddress = btcDestinationAddress;
    status.valueInWeisSentToTheBridge = amount;
    status.status = PegoutStatus.RECEIVED;

    try {
      this.pegoutStatusDataService.set(status);
      this.logger.trace(`[processReleaseRequestReceivedStatus] ${extendedBridgeTx.txHash} registered`);
    } catch(e) {
      this.logger.warn('[processReleaseRequestReceivedStatus] There was a problem with the storage', e);
    }

  }

  private processReleaseRequestRejectedStatus(extendedBridgeTx: ExtendedBridgeTx): void {

    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseRequestRejectedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);

    if(!releaseRequestRejectedEvent) {
      return;
    }

    const rskSenderAddress = <string> releaseRequestRejectedEvent.arguments.get('sender');
    const amount = <string> releaseRequestRejectedEvent.arguments.get('amount');
    const reason = <string> releaseRequestRejectedEvent.arguments.get('reason');

    const status: PegoutStatusDataModel = new PegoutStatusDataModel();

    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = rskSenderAddress;
    status.valueInWeisSentToTheBridge = amount;
    status.reason = reason;
    status.status = PegoutStatus.REJECTED;

    try {
      this.pegoutStatusDataService.set(status);
      this.logger.trace(`[processReleaseRequestRejectedStatus] ${extendedBridgeTx.txHash} registered`);
    } catch(e) {
      this.logger.warn('[processReleaseRequestRejectedStatus] There was a problem with the storage', e);
    }

  }

}
