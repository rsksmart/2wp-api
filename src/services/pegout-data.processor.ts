import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {BRIDGE_EVENTS, BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import { PegoutStatusDataService } from './pegout-status-data-services/pegout-status-data.service';
import ExtendedBridgeTx from './extended-bridge-tx';
import { PegoutStatus, PegoutStatusDataModel } from '../models/rsk/pegout-status-data-model';
import { BridgeEvent } from 'bridge-transaction-parser';
import { ServicesBindings } from '../dependency-injection-bindings';
import * as bitcoin from 'bitcoinjs-lib';
import {BridgeService} from './bridge.service';
import * as constants from '../constants';
import { remove0x } from '../utils/hex-utils';

export class PegoutDataProcessor implements FilteredBridgeTransactionProcessor {
  private logger: Logger;
  private pegoutStatusDataService: PegoutStatusDataService;
  private bridgeService: BridgeService;

  constructor(
    @inject(ServicesBindings.PEGOUT_STATUS_DATA_SERVICE)
    pegoutStatusDataService: PegoutStatusDataService,
    @inject(ServicesBindings.BRIDGE_SERVICE)
    bridgeService: BridgeService) {
    this.logger = getLogger('pegoutDataProcessor');
    this.pegoutStatusDataService = pegoutStatusDataService;
    this.bridgeService = bridgeService;
  }
  async process(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    this.logger.debug(`[process] Got tx ${extendedBridgeTx.txHash}`);

    const events: BridgeEvent[] = extendedBridgeTx.events;

    if(this.hasReleaseRequestedEvent(events)) {
      this.logger.trace('[process] found a release_requested event. Processing...');
      return await this.processReleaseRequestedStatus(extendedBridgeTx);
    }

    if(this.hasReleaseRequestReceivedEvent(events)) {
      this.logger.trace('[process] found a release_request_received event. Processing...');
      return await this.processReleaseRequestReceivedStatus(extendedBridgeTx);
    }

    if(this.hasReleaseRequestRejectedEvent(events)) {
      this.logger.trace('[process] found a release_request_rejected event. Processing...');
      return await this.processReleaseRequestRejectedStatus(extendedBridgeTx);
    }

    if(this.hasReleaseBtcEvent(events)) {
      this.logger.trace('[process] found a release_btc event. Processing...');
      return await this.processReleaseBtcStatus(extendedBridgeTx);
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

  hasReleaseRequestedEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUESTED);
  }

  hasReleaseBtcEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_BTC);
  }

  private async processReleaseRequestedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseRequestedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUESTED);
    if(!releaseRequestedEvent) {
      return;
    }

    const originatingRskTxHash = <string> releaseRequestedEvent.arguments.get('rskTxHash');
    const btcTxHash = <string> releaseRequestedEvent.arguments.get('btcTxHash');

    const foundPegoutStatus = await this.pegoutStatusDataService.getLastByOriginatingRskTxHash(originatingRskTxHash);

    if(!foundPegoutStatus) {
      return this.logger.warn(`[processReleaseRequestedStatus] could not find a pegout status record
       in the db for this transaction '${extendedBridgeTx.txHash}' with 'release_requested' event.`);
    }

    const newPegoutStatus: PegoutStatusDataModel = new PegoutStatusDataModel();

    newPegoutStatus.btcRecipientAddress = foundPegoutStatus.btcRecipientAddress; 
    newPegoutStatus.originatingRskTxHash = originatingRskTxHash;
    newPegoutStatus.valueRequestedInSatoshis = foundPegoutStatus.valueRequestedInSatoshis;
    newPegoutStatus.rskSenderAddress = foundPegoutStatus.rskSenderAddress;
    newPegoutStatus.rskTxHash = extendedBridgeTx.txHash;
    newPegoutStatus.rskBlockHeight = extendedBridgeTx.blockNumber;
    newPegoutStatus.createdOn = extendedBridgeTx.createdOn;
    newPegoutStatus.btcTxHash = btcTxHash;
    newPegoutStatus.status = PegoutStatus.WAITING_FOR_CONFIRMATION;

    await this.addValueInSatoshisToBeReceivedAndFee(newPegoutStatus);

    try {
      await this.pegoutStatusDataService.set(newPegoutStatus);
      this.logger.trace(`[processReleaseRequestedStatus] pegout status for ${originatingRskTxHash} updated.`);
    } catch(e) {
      this.logger.warn('[processReleaseRequestedStatus] There was a problem with the storage', e);
    }

  }

  private async addValueInSatoshisToBeReceivedAndFee(pegoutStatus: PegoutStatusDataModel): Promise<void> {
    const rskTxHash = remove0x(pegoutStatus.originatingRskTxHash);
    const bridgeState = await this.bridgeService.getBridgeState();

    this.logger.debug(`[addValueInSatoshisToBeReceivedAndFee] searching for a pegout 
      in the bridge state pegoutsWaitingForConfirmations with rskTxHash: ${rskTxHash}.`);

    const pegout = bridgeState.pegoutsWaitingForConfirmations.find((pegout: any) => pegout.rskTxHash === rskTxHash);

    if(!pegout) {
      this.logger.debug('[addValueInSatoshisToBeReceivedAndFee] did not find then pegout in the bridge state pegoutsWaitingForConfirmations.');
      return;
    }

    this.logger.debug('[addValueInSatoshisToBeReceivedAndFee] found a pegout in waiting for confirmations at block: ', pegout.pegoutCreationBlockNumber);

    const parsedBtcTransaction = bitcoin.Transaction.fromHex(pegout.btcRawTx);
    const output = parsedBtcTransaction.outs.find(out => {
      const parsedBtcAddress = bitcoin.address.fromOutputScript(out.script, this.getBitcoinNetwork());
      return parsedBtcAddress === pegoutStatus.btcRecipientAddress;
    });

    if(!output) {
      this.logger.debug(`[addValueInSatoshisToBeReceivedAndFee] did not find 
        an output containing the btcRecipientAddress ${pegoutStatus.btcRecipientAddress}.`);
      return;
    }
    
    pegoutStatus.valueInSatoshisToBeReceived = output.value;
    pegoutStatus.feeInSatoshisToBePaid = pegoutStatus.valueRequestedInSatoshis - pegoutStatus.valueInSatoshisToBeReceived;
    pegoutStatus.btcRawTransaction = pegout.btcRawTx;

  }

  private async processReleaseRequestReceivedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {

    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseRequestReceivedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);

    if(!releaseRequestReceivedEvent) {
      return;
    }

    const rskSenderAddress = <string> releaseRequestReceivedEvent.arguments.get('sender');
    const btcDestinationAddress = <string> releaseRequestReceivedEvent.arguments.get('btcDestinationAddress');
    const amount = <number> releaseRequestReceivedEvent.arguments.get('amount');

    const status: PegoutStatusDataModel = new PegoutStatusDataModel();

    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = rskSenderAddress;
    status.btcRecipientAddress = btcDestinationAddress;
    status.valueRequestedInSatoshis = amount;
    status.status = PegoutStatus.RECEIVED;

    try {
      await this.pegoutStatusDataService.set(status);
      this.logger.trace(`[processReleaseRequestReceivedStatus] ${extendedBridgeTx.txHash} registered`);
    } catch(e) {
      this.logger.warn('[processReleaseRequestReceivedStatus] There was a problem with the storage', e);
    }

  }

  private async processReleaseBtcStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {

    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseBTCEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_BTC);

    if(!releaseBTCEvent) {
      return;
    }

    const originatingRskTxHash = <string> releaseBTCEvent.arguments.get('rskTxHash');

    const foundPegoutStatus = await this.pegoutStatusDataService.getLastByOriginatingRskTxHash(originatingRskTxHash);

    if(!foundPegoutStatus) {
      return this.logger.warn(`[processReleaseBtcStatus] could not find a pegout status record
       in the db for this transaction '${extendedBridgeTx.txHash}' with 'release_btc' event.`);
    }

    foundPegoutStatus.status = PegoutStatus.SIGNED;

    try {
      await this.pegoutStatusDataService.set(foundPegoutStatus);
      this.logger.trace(`[processReleaseBtcStatus] ${extendedBridgeTx.txHash} registered`);
    } catch(e) {
      this.logger.warn('[processReleaseBtcStatus] There was a problem with the storage', e);
    }

  }

  private async processReleaseRequestRejectedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {

    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseRequestRejectedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);

    if(!releaseRequestRejectedEvent) {
      return;
    }

    const rskSenderAddress = <string> releaseRequestRejectedEvent.arguments.get('sender');
    const amount = <number> releaseRequestRejectedEvent.arguments.get('amount');
    const reason = <string> releaseRequestRejectedEvent.arguments.get('reason');

    const status: PegoutStatusDataModel = new PegoutStatusDataModel();

    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = rskSenderAddress;
    status.valueRequestedInSatoshis = amount;
    status.reason = reason;
    status.status = PegoutStatus.REJECTED;

    try {
      await this.pegoutStatusDataService.set(status);
      this.logger.trace(`[processReleaseRequestRejectedStatus] ${extendedBridgeTx.txHash} registered`);
    } catch(e) {
      this.logger.warn('[processReleaseRequestRejectedStatus] There was a problem with the storage', e);
    }

  }

  private getBitcoinNetwork() {
    const envNetwork = process.env.NETWORK ?? constants.NETWORK_TESTNET;
    if(envNetwork === constants.NETWORK_MAINNET) {
      return bitcoin.networks.bitcoin; 
    }
    return bitcoin.networks.testnet;
  }

}
