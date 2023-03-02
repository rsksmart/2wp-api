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

      if(this.hasReleaseBtcEvent(events)) {
        this.logger.trace('[process] found a release_btc event. Processing...');
        return await this.processSignedStatus(extendedBridgeTx);
      }

      if(this.hasBatchPegoutEvent(events)) {
        this.logger.trace('[process] found a batch_pegout_created event. Processing...');
        return await this.processBatchPegouts(extendedBridgeTx);
      }

      if(this.hasReleaseRequestedEvent(events)) {
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
      this.logger.trace(`[processSignedStatus] could not find a corresponding pegout in db waiting for signature 
      for this signed transaction: ${extendedBridgeTx.txHash}`);
      return;
    }

    const newPegoutStatus = PegoutStatusDbDataModel.clonePegoutStatusInstance(correspondingDbPegoutNowSigned);

    newPegoutStatus.btcRawTransaction = btcRawTx;
    newPegoutStatus.createdOn = extendedBridgeTx.createdOn;
    newPegoutStatus.btcTxHash = btcTx.getHash().toString('hex');
    newPegoutStatus.rskBlockHeight = extendedBridgeTx.blockNumber;
    newPegoutStatus.rskBlockHash = extendedBridgeTx.blockHash;
    newPegoutStatus.rskTxHash = extendedBridgeTx.txHash;
    newPegoutStatus.isNewestStatus = true;
    newPegoutStatus.status = PegoutStatus.SIGNED;

    try {
      correspondingDbPegoutNowSigned.isNewestStatus = false;
      this.pegoutStatusDataService.set(correspondingDbPegoutNowSigned);
      this.logger.trace(`[processSignedStatus] pegout status for ${correspondingDbPegoutNowSigned.rskTxHash} updated.`);
      this.pegoutStatusDataService.set(newPegoutStatus);
      this.logger.trace(`[processSignedStatus] pegout status for ${newPegoutStatus.rskTxHash} updated.`);
    } catch(e) {
      this.logger.warn('[processSignedStatus] There was a problem with the storage', e);
    }

  }

  private async processBatchPegouts(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];;
    const batchPegoutsEvent = events.find(event => event.name === BRIDGE_EVENTS.BATCH_PEGOUT_CREATED);

    if(!batchPegoutsEvent) {
      return;
    }

    const originatingRskTxHash = <string> batchPegoutsEvent.arguments.releaseRskTxHashes;
    const btcTxHash = <string> batchPegoutsEvent.arguments.btcTxHash;

    const foundPegoutStatuses:PegoutStatusDbDataModel[]  = await this.pegoutStatusDataService.getManyByOriginatingRskTxHash(originatingRskTxHash);
    
    if(!foundPegoutStatuses || foundPegoutStatuses.length === 0) {
      return this.logger.warn(`[processWaitingForConfirmationStatus] could not find a pegout status record
       in the db for this transaction '${extendedBridgeTx.txHash}' with 'release_requested' event.`);
    }

    this.logger.trace(`[processBatchPegouts] found ${foundPegoutStatuses.length} pegouts in the db
      for the batch pegout ${extendedBridgeTx.txHash}`);

      const newClonedPegoutStatuses:PegoutStatusDbDataModel[] = foundPegoutStatuses.map((foundPegoutStatus, index) => {
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
      const allPegouts = [...foundPegoutStatuses, ...newClonedPegoutStatuses];
      await this.saveMany(allPegouts);
      this.logger.trace(`[processBatchPegouts] ${allPegouts.length} pegouts was updated.`);
    } catch(e) {
      this.logger.warn('[processBatchPegouts] There was a problem with the storage', e);
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

    pegoutStatuses.forEach((pegout, index) => {
          const output = parsedBtcTransaction.outs[index];
          pegout.valueInSatoshisToBeReceived = output.value;
          pegout.feeInSatoshisToBePaid = pegout.valueRequestedInSatoshis - pegout.valueInSatoshisToBeReceived;
          pegout.btcRawTransaction = batchedPegout.btcRawTx;
          pegout.btcRawTxInputsHash = this.getInputsHash(parsedBtcTransaction);
    });
  }

  private getInputsHash(btcTx: bitcoin.Transaction) {
    const concatenatedBtcTxInputHashes = btcTx.ins.reduce((acc, input) => `${acc}${input.hash.toString('hex')}`, '');
    return sha256(concatenatedBtcTxInputHashes);
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

  private async processWaitingForConfirmationStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const releaseRequestedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUESTED);
    if(!releaseRequestedEvent) {
      return;
    }

    const originatingRskTxHash = <string> releaseRequestedEvent.arguments.rskTxHash;
    const btcTxHash = <string> releaseRequestedEvent.arguments.btcTxHash;

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
    newPegoutStatus.status = PegoutStatus.WAITING_FOR_CONFIRMATION;

    await this.persistPegout(newPegoutStatus, foundPegoutStatus);
  }

  private async persistPegout(newPegoutStatus: PegoutStatusDbDataModel, oldPegoutStatus:PegoutStatusDbDataModel) {
    newPegoutStatus.isNewestStatus = true;
    await this.addValueInSatoshisToBeReceivedAndFee(newPegoutStatus);

    try {
      oldPegoutStatus.isNewestStatus = false;
      await this.pegoutStatusDataService.set(oldPegoutStatus);
      this.logger.trace(`[processWaitingForConfirmationStatus] pegout status for ${oldPegoutStatus.btcTxHash} updated.`);
      await this.pegoutStatusDataService.set(newPegoutStatus);
      this.logger.trace(`[processWaitingForConfirmationStatus] pegout status for ${newPegoutStatus.originatingRskTxHash} updated.`);
    } catch(e) {
      this.logger.warn('[processWaitingForConfirmationStatus] There was a problem with the storage', e);
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
      await this.pegoutStatusDataService.set(status);
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
      for (const pegout of pegouts) {
        const saved = await this.pegoutStatusDataService.set(pegout);
        this.logger.warn('[saveMany] Pegout saved on the storage', saved);
      }
 }

  private async saveManyAsWaitingForSignature(pegouts: PegoutStatusDbDataModel[]) {
    for (const pegout of pegouts) {
      pegout.status = PegoutStatus.WAITING_FOR_SIGNATURE;
      const saved = await this.pegoutStatusDataService.set(pegout);
      this.logger.warn('[saveMany] Pegout saved on the storage', saved);
    };
  }

  public async deleteByRskBlockHeight(rskBlockHeight: number) {
    await this.pegoutStatusDataService.deleteByRskBlockHeight(rskBlockHeight);
  }

}
