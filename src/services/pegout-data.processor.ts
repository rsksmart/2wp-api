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
import { ensure0x, remove0x } from '../utils/hex-utils';
import { PegoutStatusBuilder } from './pegout-status/pegout-status-builder';
import {ExtendedBridgeEvent} from "../models/types/bridge-transaction-parser";
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
      BridgeDataFilterModel.EMPTY_DATA_FILTER,
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.RELEASE_BTC))
    ];
  }

  async process(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    try {
      this.logger.debug(`[process] Got tx ${extendedBridgeTx.txHash}`);
      const events: BridgeEvent[] = extendedBridgeTx.events;

      if (!this.isMethodAccepted(extendedBridgeTx)) {
        return this.logger.warn('[process] Received a method not accepted');
      }

      // Pegout request accepted
      if(this.hasReleaseRequestReceivedEvent(events)) {
        this.logger.trace('[process] found a release_request_received event. Processing...');
        await this.processReleaseRequestReceivedStatus(extendedBridgeTx);
      }

      // Pegout request rejected
      if(this.hasReleaseRequestRejectedEvent(events)) {
        this.logger.trace('[process] found a release_request_rejected event. Processing...');
        await this.processReleaseRequestRejectedStatus(extendedBridgeTx);
      }

      if(this.hasBatchPegoutEvent(events)) {
        // Pegout created (batched pegout)
        this.logger.trace('[process] found a batch_pegout_created event. Processing...');
        await this.processBatchPegouts(extendedBridgeTx);
      } else  if(this.hasReleaseRequestedEvent(events)) {
        // Pegout created (individual pegout) [pre HOP]
        this.logger.trace('[process] found a release_requested event. Processing...');
        await this.processIndividualPegout(extendedBridgeTx);
      }

      // Pegout fully processed
      if(this.hasReleaseBtcEvent(events)) {
        this.logger.trace('[process] found a release_btc event. Processing...');
        return await this.processSignedStatus(extendedBridgeTx);
      }

      // Update collections is used  as a trigger for pegouts that may have been confirmed and should now be waiting for signatures
      if(this.hasUpdateCollectionsEvent(events)) {
        this.logger.trace('[process] Processing waiting for signature using the update collections event.');
        await this.processWaitingForSignaturesStatus(extendedBridgeTx);
      }

    } catch (e) {
      this.logger.error(`[process] error processing pegout: ${e}`);
    }
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

  private hasBatchPegoutEvent(events: BridgeEvent[]): boolean  {
    return events.some(event => event.name === BRIDGE_EVENTS.BATCH_PEGOUT_CREATED);
  }

  private async processSignedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const releaseBTCEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_BTC);

    if(!releaseBTCEvent) {
      return;
    }
    this.logger.trace(`[processSignedStatus] Started. [rskTxHash:${extendedBridgeTx.txHash}]`);

    const dbPegoutStatusesWaitingForSignature = await this.pegoutStatusDataService.getManyWaitingForSignaturesNewest();
    const dbPegoutStatusesWaitingForConfirmation = await this.pegoutStatusDataService.getManyWaitingForConfirmationNewest();

    const dbPegouts = [...dbPegoutStatusesWaitingForSignature, ...dbPegoutStatusesWaitingForConfirmation];

    if(dbPegoutStatusesWaitingForConfirmation.length === 0) {
      this.logger.trace(`[processSignedStatus] there is no pegout waiting for confirmation in our db`);
    }

    if(dbPegoutStatusesWaitingForSignature.length === 0) {
      this.logger.trace(`[processSignedStatus] there is no pegout waiting for signatures in our db`);
    }

    if(dbPegouts.length === 0) {
      this.logger.trace(`[processSignedStatus] there is no pegout waiting for confirmations or signatures in our db`);
      return;
    }

    const concatenateBtcTxInputHashes = (btcTx: bitcoin.Transaction) => btcTx.ins.reduce((acc, input) => `${acc}_${input.hash.toString('hex')}`, '');

    const btcRawTx = remove0x(<string> releaseBTCEvent.arguments.btcRawTransaction);
    const btcTx = bitcoin.Transaction.fromHex(btcRawTx);

    const concatenatedBtcTxInputHashes = concatenateBtcTxInputHashes(btcTx);

    const correspondingDbPegoutNowSigned = dbPegouts.find(pegout => {
      const dbBtcTx = bitcoin.Transaction.fromHex(pegout.btcRawTransaction);
      const dbConcatenatedBtcTxInputHashes = concatenateBtcTxInputHashes(dbBtcTx);
      return concatenatedBtcTxInputHashes === dbConcatenatedBtcTxInputHashes;
    });

    if(!correspondingDbPegoutNowSigned) {
      this.logger.trace(`[processSignedStatus] could not find a corresponding pegout in db waiting for signature for this signed transaction: ${extendedBridgeTx.txHash}`);
      return;
    }
    this.logger.trace(`[processSignedStatus] Got a pegout waiting signatures. ${this.getLoggerContextInformation(correspondingDbPegoutNowSigned)}`);

    const newPegoutStatus = PegoutStatusDbDataModel.clonePegoutStatusInstance(correspondingDbPegoutNowSigned);
    newPegoutStatus.setRskTxInformation(extendedBridgeTx);
    newPegoutStatus.btcRawTransaction = btcRawTx;
    newPegoutStatus.btcTxHash = btcTx.getHash().toString('hex');
    newPegoutStatus.isNewestStatus = true;
    newPegoutStatus.status = PegoutStatus.SIGNED;

    try {
      correspondingDbPegoutNowSigned.isNewestStatus = false;
      await this.save(correspondingDbPegoutNowSigned);
      await this.save(newPegoutStatus);
    } catch(e) {
      this.logger.warn('[processSignedStatus] There was a problem with the storage', e);
    }

  }

  private async processBatchPegouts(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    this.logger.trace(`[processBatchPegouts] Started [rsktxhash:${extendedBridgeTx.txHash}]`);
    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const batchPegoutsEvent = events.find(event => event.name === BRIDGE_EVENTS.BATCH_PEGOUT_CREATED);

    if(!batchPegoutsEvent) {
      return;
    }

    const btcTxHash = <string> batchPegoutsEvent.arguments.btcTxHash;
    /**
     * RSKIP271 - Pegout batching defines the event batch_pegout_created
     * It also establishes that the argument releaseRskTxHashes is a concatenation of all the originating Rootstock tx hashes of the pegout requests.
     * Slice the releaseRskTxHashes argument every 64 characters to get the originating tx hash and process them individually
     **/
    let eventData = remove0x(batchPegoutsEvent.arguments.releaseRskTxHashes);
    let index = 0;
    while(eventData != '') {
      const hashData = eventData.slice(0, 64);
      const originatingRskTxHash = ensure0x(hashData);
      this.logger.trace(`[processBatchPegouts] Processing individual pegout creation in batch. [rsktxhash:${extendedBridgeTx.txHash}] [originatingRskTxHash:${originatingRskTxHash}]`);

      const foundPegoutStatus  = await this.pegoutStatusDataService.getLastByOriginatingRskTxHash(originatingRskTxHash);
      
      if(!foundPegoutStatus) {
        this.logger.warn(`[processBatchPegouts] could not find a pegout status record in the db. [originatingRskTxHash:${originatingRskTxHash}]`);
        break;
      }

      this.logger.trace(`[processBatchPegouts] Got the pegout previous state from the db`);

      const newClonedPegoutStatus = PegoutStatusDbDataModel.clonePegoutStatusInstance(foundPegoutStatus);
      newClonedPegoutStatus.setRskTxInformation(extendedBridgeTx);
      newClonedPegoutStatus.status = PegoutStatus.WAITING_FOR_CONFIRMATION;
      newClonedPegoutStatus.isNewestStatus = true;
      // Many pegouts with HOP will share the same rskTxHash, so, appending the index to differentiate them
      // and make each have a unique rskTxHash that includes to which btc tx output index each pegout belongs
      newClonedPegoutStatus.rskTxHash = `${extendedBridgeTx.txHash}_${index}`;
      newClonedPegoutStatus.btcTxHash = btcTxHash;
      newClonedPegoutStatus.btcRecipientAddress = foundPegoutStatus.btcRecipientAddress;
      newClonedPegoutStatus.batchPegoutIndex = index;
      newClonedPegoutStatus.batchPegoutRskTxHash = extendedBridgeTx.txHash;

      await this.addBatchValueInSatoshisToBeReceivedAndFee(newClonedPegoutStatus, extendedBridgeTx.txHash);

      try {
        // Update previous status as outdated
        foundPegoutStatus.isNewestStatus = false;
        const allPegouts = [foundPegoutStatus, newClonedPegoutStatus];
        await this.saveMany(allPegouts);
        this.logger.trace(`[processBatchPegouts] ${allPegouts.length} pegouts were updated.`);
      } catch(e) {
        this.logger.warn('[processBatchPegouts] There was a problem with the storage', e);
      }
      eventData = eventData.replace(hashData, '');
      index++;
    }

  }

  private async addBatchValueInSatoshisToBeReceivedAndFee(pegoutStatus: PegoutStatusDbDataModel, rskTxHash: string): Promise<void> {
    const bridgeState = await this.bridgeService.getBridgeState();
    const batchedPegout = bridgeState.pegoutsWaitingForConfirmations.find(pegout => pegout.rskTxHash === rskTxHash);

    if(!batchedPegout) {
      this.logger.debug(`[addValueInSatoshisToBeReceivedAndFee] did not find the batched pegout in the bridge state pegoutsWaitingForConfirmations. [rsktxhash: ${rskTxHash}][originatingRskTxHash:${pegoutStatus.originatingRskTxHash}]`);
      return;
    }
    this.logger.debug(`[addValueInSatoshisToBeReceivedAndFee] Got the batched pegout in the bridge state pegoutsWaitingForConfirmations. [rsktxhash: ${rskTxHash}][originatingRskTxHash:${pegoutStatus.originatingRskTxHash}]`);

    const parsedBtcTransaction = bitcoin.Transaction.fromHex(batchedPegout.btcRawTx);

    const output = parsedBtcTransaction.outs[pegoutStatus.batchPegoutIndex];
    pegoutStatus.valueInSatoshisToBeReceived = output.value;
    pegoutStatus.feeInSatoshisToBePaid = pegoutStatus.valueRequestedInSatoshis - pegoutStatus.valueInSatoshisToBeReceived;
    pegoutStatus.btcRawTransaction = batchedPegout.btcRawTx;
    pegoutStatus.btcRawTxInputsHash = this.getInputsHash(parsedBtcTransaction);
  }

  private getInputsHash(btcTx: bitcoin.Transaction) {
    const concatenatedBtcTxInputHashes = btcTx.ins.reduce((acc, input) => `${acc}${input.hash.toString('hex')}`, '');
    return sha256(concatenatedBtcTxInputHashes);
  }

  private async processWaitingForSignaturesStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const currentBlockHeight = extendedBridgeTx.blockNumber;
    const rskMaximumConfirmation = Number(process.env.RSK_PEGOUT_MINIMUM_CONFIRMATIONS);

    this.logger.trace(`[processWaitingForSignaturesStatus] currentBlockHeight: ${currentBlockHeight}`);

    const dbPegoutsWaitingForConfirmations = await this.pegoutStatusDataService.getManyWaitingForConfirmationNewest();
    this.logger.trace(`[processWaitingForSignaturesStatus] number of pegouts waiting for confirmations: ${dbPegoutsWaitingForConfirmations.length}`);
    
    const dbPegoutsWithEnoughConfirmations: PegoutStatusDbDataModel[] = dbPegoutsWaitingForConfirmations.filter(dbPegout => {
      const blockHeightDiff = currentBlockHeight - dbPegout.rskBlockHeight;
      return blockHeightDiff >= rskMaximumConfirmation;
    });
    this.logger.trace(`[processWaitingForSignaturesStatus] number of pegouts confirmed: ${dbPegoutsWithEnoughConfirmations.length}`);
    
    // TODO: this is most likely incorrect. The processor is syncing so the state up to this point is what we get from the tx itself

    // const bridgeState = await this.bridgeService.getBridgeState();
    // const pegoutsWaitingForConfirmationMap = bridgeState.pegoutsWaitingForConfirmations
    //     .reduce((accumulator, pegout) => accumulator.set(pegout.rskTxHash, pegout), new Map<string, PegoutWaitingConfirmation>());
    // if(pegoutsWaitingForConfirmationMap.size === 0) {
    //   this.logger.trace(`[processWaitingForSignaturesStatus] no transactions in waiting for confirmation in the bridge state.`);
    //   // If none of the pegouts in the db waiting for confirmation are found in the bridge state,
    //   // it means the were already moved further. Setting them to the next status, waiting for signatures.
    //   return await this.saveManyAsWaitingForSignature(dbPegoutsWithEnoughConfirmations);
    // }
    // const pegoutsWaitingForSignatures = dbPegoutsWithEnoughConfirmations.reduce((accumulator: Array<PegoutStatusDbDataModel>, dbPegoutWaitingForSignature: PegoutStatusDbDataModel) => {
    //   const rskTxHash = remove0x(dbPegoutWaitingForSignature.rskTxHash);
    //   const pegoutStillInWaitingForConfirmation = pegoutsWaitingForConfirmationMap.get(rskTxHash);
    //   if(!pegoutStillInWaitingForConfirmation) {
    //     accumulator.push(dbPegoutWaitingForSignature);
    //   }
    //   return accumulator;
    // }, []);
    try {
      for (let pegoutToConfirm of dbPegoutsWaitingForConfirmations) {
        const confirmedPegout: PegoutStatusDbDataModel = PegoutStatusDbDataModel.clonePegoutStatusInstance(pegoutToConfirm);
        confirmedPegout.setRskTxInformation(extendedBridgeTx);
        confirmedPegout.isNewestStatus = true;
        confirmedPegout.status = PegoutStatus.WAITING_FOR_SIGNATURE;
        pegoutToConfirm.isNewestStatus = false;
        await this.save(pegoutToConfirm);
        await this.save(confirmedPegout);
      }
    } catch (e) {
      this.logger.warn(`[processWaitingForSignaturesStatus] Error writing to storage`);
    }
  }

  private async processIndividualPegout(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const releaseRequestedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUESTED);
    
    this.logger.trace(`[processIndividualPegout] Started. [rsktxhash:${extendedBridgeTx.txHash}]`);
    
    if(!releaseRequestedEvent) {
      return;
    }

    const originatingRskTxHash = <string> releaseRequestedEvent.arguments.rskTxHash;
    const btcTxHash = <string> releaseRequestedEvent.arguments.btcTxHash;

    // TODO: Every pegout after HOP will fail to be found in this way. Consider removing this logic.
    const foundPegoutStatus = await this.pegoutStatusDataService.getLastByOriginatingRskTxHash(originatingRskTxHash);
    if(!foundPegoutStatus) {
      return this.logger.warn(`[processIndividualPegout] Pegout request for this pegout creation not found (most likely migration or pegin rejection). Processor will not store this pegout. [originatingRskTxHash:${originatingRskTxHash}]`);
    }

    const newPegoutStatus: PegoutStatusDbDataModel = PegoutStatusDbDataModel.clonePegoutStatusInstance(foundPegoutStatus);
    newPegoutStatus.setRskTxInformation(extendedBridgeTx);
    newPegoutStatus.originatingRskTxHash = originatingRskTxHash;
    newPegoutStatus.btcTxHash = btcTxHash;
    newPegoutStatus.status = PegoutStatus.WAITING_FOR_CONFIRMATION;

    newPegoutStatus.isNewestStatus = true;
    await this.addValueInSatoshisToBeReceivedAndFee(newPegoutStatus);

    try {
      foundPegoutStatus.isNewestStatus = false;
      await this.save(foundPegoutStatus);
      await this.save(newPegoutStatus);
    } catch(e) {
      this.logger.warn('[processIndividualPegout] There was a problem with the storage', e);
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
    const releaseRequestReceivedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);

    if(!releaseRequestReceivedEvent) {
      return;
    }

    const status = await PegoutStatusBuilder.fillRequestReceivedStatus(extendedBridgeTx);

    try {
      await this.save(status);
      this.logger.trace(`[processReleaseRequestReceivedStatus] ${extendedBridgeTx.txHash} registered`);
    } catch(e) {
      this.logger.warn('[processReleaseRequestReceivedStatus] There was a problem with the storage', e);
    }
  }

  private async processReleaseRequestRejectedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: BridgeEvent[] = extendedBridgeTx.events;
    const releaseRequestRejectedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);

    if(!releaseRequestRejectedEvent) {
      return;
    }

   const status = await PegoutStatusBuilder.fillRequestRejectedStatus(extendedBridgeTx);

    try {
      await this.save(status);
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
      for (const pegout of pegouts) {
        await this.save(pegout);
      }
 }

  private async save(pegout: PegoutStatusDbDataModel): Promise<Boolean> {
    this.logger.info(`[save] Pegout saved on the storage. ${this.getLoggerContextInformation(pegout)}`);
    return this.pegoutStatusDataService.set(pegout);
  }

  private getLoggerContextInformation(pegout: PegoutStatusDbDataModel): string {
    return `[rskTxHash:${pegout.rskTxHash}][originatingRskTxHash:${pegout.originatingRskTxHash}][status:${pegout.status}]${pegout.btcTxHash? '[btctxhash:' + pegout.btcTxHash + ']':''}`;
  }

  public async deleteByRskBlockHeight(rskBlockHeight: number) {
    await this.pegoutStatusDataService.deleteByRskBlockHeight(rskBlockHeight);
  }

  public isMethodAccepted(extendedBridgeTx: ExtendedBridgeTx) {
    const acceptedMethods = [
      '',
      BRIDGE_METHODS.UPDATE_COLLECTIONS,
      BRIDGE_METHODS.ADD_SIGNATURE,
      BRIDGE_METHODS.RELEASE_BTC
    ];
    const name = (extendedBridgeTx.method.name || extendedBridgeTx.method.name === '') ? extendedBridgeTx.method.name : extendedBridgeTx.method as unknown as string;
    return acceptedMethods.some(am => am == name);
  }

}
