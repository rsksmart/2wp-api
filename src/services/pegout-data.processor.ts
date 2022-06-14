import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {BRIDGE_EVENTS, BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import { PegoutStatusDataService } from './pegout-status-data-services/pegout-status-data.service';
import ExtendedBridgeTx from './extended-bridge-tx';
import { PegoutStatus, PegoutStatusDbDataModel } from '../models/rsk/pegout-status-data-model';
import { BridgeEvent } from 'bridge-transaction-parser';
import { ServicesBindings } from '../dependency-injection-bindings';
import * as bitcoin from 'bitcoinjs-lib';
import {BridgeService} from './bridge.service';
import * as constants from '../constants';
import { remove0x } from '../utils/hex-utils';
import { PegoutWaitingConfirmation } from 'bridge-state-data-parser';
import { sha256 } from '../utils/sha256-utils';

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

  getFilters(): BridgeDataFilterModel[] {
    // TODO: add BRIDGE_METHODS.RELEASE_BTC = 'releaseBtc' when this method is available in the bridge abis.
    return [
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS)),
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.ADD_SIGNATURE)),
      BridgeDataFilterModel.EMPTY_DATA_FILTER
    ];
  }

  async process(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    this.logger.debug(`[process] Got tx ${extendedBridgeTx.txHash}`);

    const events: BridgeEvent[] = extendedBridgeTx.events;

    if(this.hasReleaseBtcEvent(events)) {
      this.logger.trace('[process] found a release_btc event. Processing...');
      return await this.processSignedStatus(extendedBridgeTx);
    }

    if(Boolean(process.env.HOP_ACTIVATED) && this.hasBatchPegoutEvent(events)) {
      this.logger.trace('[process] found a batch_pegout_created event. Processing...');
      return await this.processBatchPegouts(extendedBridgeTx);
    } else if(this.hasReleaseRequestedEvent(events)) {
      this.logger.trace('[process] found a release_requested event. Processing...');
      return await this.processWaitingForConfirmationStatus(extendedBridgeTx);
    }

    if(this.hasReleaseRequestReceivedEvent(events)) {
      this.logger.trace('[process] found a release_request_received event. Processing...');
      return await this.processReleaseRequestReceivedStatus(extendedBridgeTx);
    }

    if(this.hasReleaseRequestRejectedEvent(events)) {
      this.logger.trace('[process] found a release_request_rejected event. Processing...');
      return await this.processReleaseRequestRejectedStatus(extendedBridgeTx);
    }

    if(this.hasUpdateCollectionsEvent(events)) {
      this.logger.trace('[process] Processing waiting for signature using the update collections event.');
      return await this.processWaitingForSignaturesStatus(extendedBridgeTx);
    }

    this.logger.warn('[process] other statuses processing not yet implemented.');

  }

  private hasBatchPegoutEvent(events: BridgeEvent[]): boolean  {
    return events.some(event => event.name === BRIDGE_EVENTS.BATCH_PEGOUT_CREATED);
  }

  private hasReleaseRequestReceivedEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);
  }

  private hasReleaseRequestRejectedEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);
  }

  private hasReleaseRequestedEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUESTED);
  }

  private hasUpdateCollectionsEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.UPDATE_COLLECTIONS);
  }

  private hasReleaseBtcEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_BTC);
  }

  private async processSignedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseBTCEvent = <BridgeEvent> events.find(event => event.name === BRIDGE_EVENTS.RELEASE_BTC);

    const btcRawTx = remove0x(<string> releaseBTCEvent.arguments.get('btcRawTransaction'));
    const btcTx = bitcoin.Transaction.fromHex(btcRawTx);
    const btcRawTxInputsHash = this.getInputsHash(btcTx);

    const dbPegouts = await this.pegoutStatusDataService.getManyByBtcRawTxInputsHashNewest(btcRawTxInputsHash);

    if(dbPegouts.length === 0) {
      this.logger.trace(`[processSignedStatus] there is no pegout waiting for confirmations or signatures in our db
       corresponding to the raw btc transaction for rsk tx: ${extendedBridgeTx.txHash}`);
      return;
    }

    const newPegoutsStatuses = dbPegouts.map((pegout, index) => {
      const newPegoutStatus = PegoutStatusDbDataModel.clonePegoutStatusInstance(pegout);
      newPegoutStatus.btcRawTransaction = btcRawTx;
      newPegoutStatus.createdOn = extendedBridgeTx.createdOn;
      newPegoutStatus.btcTxHash = btcTx.getHash().toString('hex');
      newPegoutStatus.rskBlockHeight = extendedBridgeTx.blockNumber;
      newPegoutStatus.rskBlockHash = extendedBridgeTx.blockHash;
      newPegoutStatus.rskTxHash = `${extendedBridgeTx.txHash}_${index}`;
      newPegoutStatus.isNewestStatus = true;
      newPegoutStatus.batchPegoutIndex = index;
      newPegoutStatus.batchPegoutRskTxHash = extendedBridgeTx.txHash;
      newPegoutStatus.status = PegoutStatus.SIGNED;
      return newPegoutStatus;
    });

    try {
      dbPegouts.forEach(pegout => pegout.isNewestStatus = false);
      await this.saveMany(dbPegouts);
      this.logger.trace(`[processSignedStatus] ${dbPegouts.length} pegouts in WAITING_FOR_CONFIRMATION/WAITING_FOR_SIGNATURE updated.`);
      await this.saveMany(newPegoutsStatuses);
      this.logger.trace(`[processSignedStatus] ${newPegoutsStatuses.length} pegouts updated to SIGNED status.`);
    } catch(e) {
      this.logger.warn('[processSignedStatus] There was a problem with the storage', e);
    }

  }

  private async processWaitingForSignaturesStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const currentBlockHeight = extendedBridgeTx.blockNumber;
    this.logger.trace(`[processWaitingForSignaturesStatus] currentBlockHeight: ${currentBlockHeight}`);
    const rskMaximumConfirmation = Number(process.env.RSK_PEGOUT_MINIMUM_CONFIRMATIONS);
    const dbPegoutsWaitingForConfirmations = await this.pegoutStatusDataService.getManyWaitingForConfirmationNewest();
    this.logger.trace(`[processWaitingForSignaturesStatus] number of dbPegoutsWaitingForConfirmations: ${dbPegoutsWaitingForConfirmations.length}`);
    const dbPegoutsWithEnoughConfirmations: PegoutStatusDbDataModel[] = dbPegoutsWaitingForConfirmations.filter(dbPegout => {
      const blockHeightDiff = currentBlockHeight - dbPegout.rskBlockHeight;
      return blockHeightDiff >= rskMaximumConfirmation;
    });
    this.logger.trace(`[processWaitingForSignaturesStatus] number of dbPegoutsWaitingForConfirmations with enough confirmations: ${dbPegoutsWithEnoughConfirmations.length}`);
    const bridgeState = await this.bridgeService.getBridgeState();
    const pegoutsWaitingForConfirmationMap = bridgeState.pegoutsWaitingForConfirmations
        .reduce((accumulator, pegout) => accumulator.set(pegout.rskTxHash, pegout), new Map<string, PegoutWaitingConfirmation>());
    if(pegoutsWaitingForConfirmationMap.size === 0) {
      this.logger.trace(`[processWaitingForSignaturesStatus] no transactions in waiting for confirmation in the bridge state.`);
      // If none of the pegouts in the db waiting for confirmation are found in the bridge state,
      // it means the were already moved further. Setting them to the next status, waiting for signatures.
      return await this.saveManyAsWaitingForSignature(dbPegoutsWithEnoughConfirmations);
    }
    const pegoutsWaitingForSignatures = dbPegoutsWithEnoughConfirmations.reduce((accumulator: Array<PegoutStatusDbDataModel>, dbPegoutWaitingForSignature: PegoutStatusDbDataModel) => {
      const rskTxHash = remove0x(dbPegoutWaitingForSignature.rskTxHash);
      const pegoutStillInWaitingForConfirmation = pegoutsWaitingForConfirmationMap.get(rskTxHash);
      if(!pegoutStillInWaitingForConfirmation) {
        accumulator.push(dbPegoutWaitingForSignature);
      }
      return accumulator;
    }, []);
    await this.saveManyAsWaitingForSignature(pegoutsWaitingForSignatures);
  }

  /**
   * Sorts the pegouts in the same order that the their corresponding rskTxHash is in rskTxHashes and returns the sorted pegouts
   * This method assumes that pegouts.length === rskTxHashes.length, and that all rskTxHashes in rskTxHashes have their corresponding pegout in the pegouts list
   * @param {PegoutStatusDbDataModel[]} pegouts 
   * @param {string[]} rskTxHashes 
   * @returns {PegoutStatusDbDataModel[]} sortedPegouts
   */
  private sortBasedOnTxHashListOrder(pegouts: PegoutStatusDbDataModel[], rskTxHashes: string[]): PegoutStatusDbDataModel[] {
    const pegoutStatusesMapByRskTxHash = pegouts.reduce((acc, pegout) => acc.set(pegout.rskTxHash, pegout)
      , <Map<string, PegoutStatusDbDataModel>> new Map());
    const sortedPegouts: PegoutStatusDbDataModel[] = rskTxHashes.map(rskTxHash => <PegoutStatusDbDataModel> pegoutStatusesMapByRskTxHash.get(rskTxHash));
    return sortedPegouts;
  }

  private async processBatchPegouts(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: BridgeEvent[] = extendedBridgeTx.events;
    const batchPegoutsEvent = <BridgeEvent> events.find(event => event.name === BRIDGE_EVENTS.BATCH_PEGOUT_CREATED);

    const btcTxHash = <string> batchPegoutsEvent.arguments.get('btcTxHash');
    const originatingRskTxHashes = <Array<string>> batchPegoutsEvent.arguments.get('releaseRskTxHashes');
    
    const foundPegoutStatuses = await this.pegoutStatusDataService.getManyByRskTxHashes(originatingRskTxHashes);
    
    if(foundPegoutStatuses.length === 0) {
      return this.logger.trace(`[processBatchPegouts] didn't find any pegouts in the db for batch pegout ${extendedBridgeTx.txHash}`);
    }

    this.logger.trace(`[processBatchPegouts] found ${foundPegoutStatuses.length} pegouts in the db
      for the batch pegout ${extendedBridgeTx.txHash}`);

    const sortedPegouts = this.sortBasedOnTxHashListOrder(foundPegoutStatuses, originatingRskTxHashes);

    const newClonedPegoutStatuses = sortedPegouts.map((foundPegoutStatus, index) => {
      const newPegoutStatus: PegoutStatusDbDataModel = PegoutStatusDbDataModel.clonePegoutStatusInstance(foundPegoutStatus);
      newPegoutStatus.btcRecipientAddress = foundPegoutStatus.btcRecipientAddress;
      // Many pegouts with HOP will share the same rskTxHash, so, appending the index to differentiate them
      // and make each have a unique rskTxHash that includes to which btc tx output index each pegout belongs
      newPegoutStatus.rskTxHash = `${extendedBridgeTx.txHash}_${index}`;
      newPegoutStatus.rskBlockHeight = extendedBridgeTx.blockNumber;
      newPegoutStatus.createdOn = extendedBridgeTx.createdOn;
      newPegoutStatus.btcTxHash = btcTxHash;
      newPegoutStatus.rskBlockHash = extendedBridgeTx.blockHash;
      newPegoutStatus.isNewestStatus = true;
      newPegoutStatus.status = PegoutStatus.WAITING_FOR_CONFIRMATION;
      newPegoutStatus.batchPegoutIndex = index;
      newPegoutStatus.batchPegoutRskTxHash = extendedBridgeTx.txHash;
      return newPegoutStatus;
    });

    await this.addBatchValueInSatoshisToBeReceivedAndFee(newClonedPegoutStatuses, extendedBridgeTx.txHash);

    try {

      foundPegoutStatuses.forEach(pegout => pegout.isNewestStatus = false);

      await this.saveMany(foundPegoutStatuses);
      this.logger.trace(`[processBatchPegouts] ${foundPegoutStatuses.length} pegouts in RECEIVED updated.`);
      await this.saveMany(newClonedPegoutStatuses);
      this.logger.trace(`[processBatchPegouts] ${newClonedPegoutStatuses.length} pegouts in WAITING_FOR_CONFIRMATION saved.`);

    } catch(e) {
      this.logger.warn('[processBatchPegouts] There was a problem with the storage', e);
    }

  }

  private async processWaitingForConfirmationStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseRequestedEvent = <BridgeEvent> events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUESTED);

    const originatingRskTxHash = <string> releaseRequestedEvent.arguments.get('rskTxHash');
    const btcTxHash = <string> releaseRequestedEvent.arguments.get('btcTxHash');

    const foundPegoutStatus = await this.pegoutStatusDataService.getLastByOriginatingRskTxHash(originatingRskTxHash);
    if(!foundPegoutStatus) {
      return this.logger.warn(`[processWaitingForConfirmationStatus] could not find a pegout status record
       in the db for this transaction '${extendedBridgeTx.txHash}' with 'release_requested' event.`);
    }
    
    const newPegoutStatus: PegoutStatusDbDataModel = PegoutStatusDbDataModel.clonePegoutStatusInstance(foundPegoutStatus);

    newPegoutStatus.btcRecipientAddress = foundPegoutStatus.btcRecipientAddress;
    newPegoutStatus.originatingRskTxHash = originatingRskTxHash;
    newPegoutStatus.rskTxHash = extendedBridgeTx.txHash;
    newPegoutStatus.rskBlockHeight = extendedBridgeTx.blockNumber;
    newPegoutStatus.createdOn = extendedBridgeTx.createdOn;
    newPegoutStatus.btcTxHash = btcTxHash;
    newPegoutStatus.rskBlockHash = extendedBridgeTx.blockHash;
    newPegoutStatus.isNewestStatus = true;
    newPegoutStatus.status = PegoutStatus.WAITING_FOR_CONFIRMATION;

    await this.addValueInSatoshisToBeReceivedAndFee(newPegoutStatus);

    try {
      foundPegoutStatus.isNewestStatus = false;
      await this.pegoutStatusDataService.set(foundPegoutStatus);
      this.logger.trace(`[processWaitingForConfirmationStatus] pegout status for ${foundPegoutStatus.btcTxHash} updated.`);
      await this.pegoutStatusDataService.set(newPegoutStatus);
      this.logger.trace(`[processWaitingForConfirmationStatus] pegout status for ${originatingRskTxHash} updated.`);
    } catch(e) {
      this.logger.warn('[processWaitingForConfirmationStatus] There was a problem with the storage', e);
    }

  }

  private async addBatchValueInSatoshisToBeReceivedAndFee(pegoutStatuses: PegoutStatusDbDataModel[], rskTxHash: string): Promise<void> {

    const bridgeState = await this.bridgeService.getBridgeState();
    const batchedPegout = bridgeState.pegoutsWaitingForConfirmations.find(pegout => pegout.rskTxHash === rskTxHash);

    if(!batchedPegout) {
      this.logger.debug('[addValueInSatoshisToBeReceivedAndFee] did not find then batched pegout in the bridge state pegoutsWaitingForConfirmations.');
      return;
    }

    const parsedBtcTransaction = bitcoin.Transaction.fromHex(batchedPegout.btcRawTx);

    for(let i = 0; i < pegoutStatuses.length; i++) {
          const pegout = pegoutStatuses[i];
          const output = parsedBtcTransaction.outs[i];
          pegout.valueInSatoshisToBeReceived = output.value;
          pegout.feeInSatoshisToBePaid = pegout.valueRequestedInSatoshis - pegout.valueInSatoshisToBeReceived;
          pegout.btcRawTransaction = batchedPegout.btcRawTx;
          pegout.btcRawTxInputsHash = this.getInputsHash(parsedBtcTransaction);
    }

  }

  private async addValueInSatoshisToBeReceivedAndFee(pegoutStatus: PegoutStatusDbDataModel): Promise<void> {
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
    const releaseRequestReceivedEvent = <BridgeEvent> events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);

    const rskSenderAddress = <string> releaseRequestReceivedEvent.arguments.get('sender');
    const btcDestinationAddress = <string> releaseRequestReceivedEvent.arguments.get('btcDestinationAddress');
    const amount = <number> releaseRequestReceivedEvent.arguments.get('amount');

    const status: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();

    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = rskSenderAddress;
    status.btcRecipientAddress = btcDestinationAddress;
    status.valueRequestedInSatoshis = amount;
    status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
    status.status = PegoutStatus.RECEIVED;
    status.rskBlockHash = extendedBridgeTx.blockHash;
    status.originatingRskBlockHash = extendedBridgeTx.blockHash;
    status.isNewestStatus = true;

    try {
      await this.pegoutStatusDataService.set(status);
      this.logger.trace(`[processReleaseRequestReceivedStatus] ${extendedBridgeTx.txHash} registered`);
    } catch(e) {
      this.logger.warn('[processReleaseRequestReceivedStatus] There was a problem with the storage', e);
    }

  }

  private async processReleaseRequestRejectedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {

    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseRequestRejectedEvent = <BridgeEvent> events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);

    const rskSenderAddress = <string> releaseRequestRejectedEvent.arguments.get('sender');
    const amount = <number> releaseRequestRejectedEvent.arguments.get('amount');
    const reason = <string> releaseRequestRejectedEvent.arguments.get('reason');

    const status: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();

    status.createdOn = extendedBridgeTx.createdOn;
    status.originatingRskTxHash = extendedBridgeTx.txHash;
    status.rskTxHash = extendedBridgeTx.txHash;
    status.rskBlockHeight = extendedBridgeTx.blockNumber;
    status.rskSenderAddress = rskSenderAddress;
    status.valueRequestedInSatoshis = amount;
    status.reason = reason;
    status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
    status.status = PegoutStatus.REJECTED;
    status.isNewestStatus = true;

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

private async saveMany(pegouts: PegoutStatusDbDataModel[]) {
    for(let i = 0; i < pegouts.length; i++) {
      const pegout = pegouts[i];
      await this.pegoutStatusDataService.set(pegout);
    }
  }

  private async saveManyAsWaitingForSignature(pegouts: PegoutStatusDbDataModel[]) {
    for(let i = 0; i < pegouts.length; i++) {
      const pegout = pegouts[i];
      pegout.status = PegoutStatus.WAITING_FOR_SIGNATURE;
      await this.pegoutStatusDataService.set(pegout);
    }
  }

  private getInputsHash(btcTx: bitcoin.Transaction) {
    const concatenatedBtcTxInputHashes = btcTx.ins.reduce((acc, input) => `${acc}${input.hash.toString('hex')}`, '');
    return sha256(concatenatedBtcTxInputHashes);
  }

}
