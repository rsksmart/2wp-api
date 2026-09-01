import {inject} from '@loopback/core';
import { BridgeEvent } from '@rsksmart/bridge-transaction-parser';
import * as bitcoin from 'bitcoinjs-lib';
import Web3 from 'web3';
import {getLogger, Logger} from '../utils/logger';
import {BRIDGE_EVENTS, BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from './filtered-bridge-transaction-processor';
import { BridgeDataFilterModel } from '../models/bridge-data-filter.model';
import { PegoutStatusDataService } from './pegout-status-data-services/pegout-status-data.service';
import ExtendedBridgeTx from './extended-bridge-tx';
import { PegoutStatuses, PegoutStatusDbDataModel } from '../models/rsk/pegout-status-data-model';
import { ServicesBindings } from '../dependency-injection-bindings';
import {BridgeService} from './bridge.service';
import * as constants from '../constants';
import {ensure0x, ensureRskHashLength, remove0x} from '../utils/hex-utils';
import { PegoutStatusBuilder } from './pegout-status/pegout-status-builder';
import {ExtendedBridgeEvent} from "../models/types/bridge-transaction-parser";
import { sha256 } from '../utils/sha256-utils';
import { FullRskTransaction } from '../models/rsk/full-rsk-transaction.model';
import { AtlasEventPublisher } from './atlas/atlas-event-publisher';
import { PegoutAtlasEventBuilder, PegoutAtlasEventContext } from './atlas/pegout-atlas-event.builder';

export class PegoutDataProcessor implements FilteredBridgeTransactionProcessor {
  private logger: Logger;
  private pegoutStatusDataService: PegoutStatusDataService;
  private bridgeService: BridgeService;
  private atlasEventPublisher: AtlasEventPublisher;

  constructor(
    @inject(ServicesBindings.PEGOUT_STATUS_DATA_SERVICE)
    pegoutStatusDataService: PegoutStatusDataService,
    @inject(ServicesBindings.BRIDGE_SERVICE)
    bridgeService: BridgeService,
    @inject(ServicesBindings.ATLAS_EVENT_PUBLISHER)
    atlasEventPublisher: AtlasEventPublisher) {
    this.logger = getLogger('pegoutDataProcessor');
    this.pegoutStatusDataService = pegoutStatusDataService;
    this.bridgeService = bridgeService;
    this.atlasEventPublisher = atlasEventPublisher;
  }

  getFilters(): BridgeDataFilterModel[] {
    return [
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS)),
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.ADD_SIGNATURE)),
      BridgeDataFilterModel.EMPTY_DATA_FILTER,
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.RELEASE_BTC))
    ];
  }

  async process(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    try {
      this.logger.debug({method: 'process', txHash: extendedBridgeTx.txHash}, 'Got tx');
      const events: BridgeEvent[] = extendedBridgeTx.events;

      if (!this.isMethodAccepted(extendedBridgeTx)) {
        return this.logger.warn({method: 'process'}, 'Received a method not accepted');
      }
      // Pegout request accepted
      if(this.hasReleaseRequestReceivedEvent(events)) {
        this.logger.debug({method: 'process'}, 'Found a release_request_received event, processing');
        await this.processReleaseRequestReceivedStatus(extendedBridgeTx);
      }

      // Pegout request rejected
      if(this.hasReleaseRequestRejectedEvent(events)) {
        this.logger.debug({method: 'process'}, 'Found a release_request_rejected event, processing');
        await this.processReleaseRequestRejectedStatus(extendedBridgeTx);
      }

      if(this.hasBatchPegoutEvent(events)) {
        this.logger.debug({method: 'process'}, 'Found a batch_pegout_created event, processing');
        await this.processBatchPegouts(extendedBridgeTx);
      } else  if(this.hasReleaseRequestedEvent(events)) {
        // Pegout created (individual pegout) [pre HOP]
        this.logger.debug({method: 'process'}, 'Found a release_requested event, processing');
        await this.processIndividualPegout(extendedBridgeTx);
      }

      // Pegout confirmed and waiting for signatures
      if(this.hasPegoutConfirmedEvent(events)) {
        this.logger.debug({method: 'process'}, 'Found a pegout_confirmed event, processing');
        await this.processPegoutConfirmedStatus(extendedBridgeTx);
      }

      // Pegout fully processed
      if(this.hasReleaseBtcEvent(events)) {
        this.logger.debug({method: 'process'}, 'Found a release_btc event, processing');
        return await this.processSignedStatusByRtx(extendedBridgeTx);
      }

    } catch (e) {
      this.logger.error({method: 'process', err: e}, 'Error processing pegout');
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

  private hasPegoutConfirmedEvent(events: BridgeEvent[]): boolean {
    return events.some(event => event.name === BRIDGE_EVENTS.PEGOUT_CONFIRMED);
  }

  private async processSignedStatusByRtx(extendedBridgeTx: ExtendedBridgeTx): Promise<void>  {
    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const releaseBTCEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_BTC);

    if(!releaseBTCEvent) {
      return;
    }
    this.logger.debug({method: 'processSignedStatusByRtx', txHash: extendedBridgeTx.txHash}, 'Started');

    const rawTx = remove0x(<string> releaseBTCEvent.arguments.btcRawTransaction);
    const parsedBtcTransaction = bitcoin.Transaction.fromHex(rawTx);

    let btcNetwork = bitcoin.networks.testnet;
    const network = process.env.NETWORK ?? constants.NETWORK_TESTNET;

    if(network === constants.NETWORK_MAINNET){
      btcNetwork = bitcoin.networks.bitcoin;
    }
    const batchPegoutCreationTx = releaseBTCEvent.arguments.releaseRskTxHash;

    for(const [outputIndex, output] of parsedBtcTransaction.outs.entries()) {
      let address;
      try {
        address = bitcoin.address.fromOutputScript(output.script, btcNetwork);
      } catch (e) {
        // Federation change outputs are not addressable pegout recipients.
        continue;
      }

      const dbPegout = await this.pegoutStatusDataService.getPegoutByRecipientAndCreationTx(address, batchPegoutCreationTx);
      const thePegout = this.selectPegoutForOutput(dbPegout, outputIndex);
      if(!thePegout) {
        this.logger.debug({method: 'processSignedStatusByRtx', address, batchPegoutCreationTx, outputIndex, candidates: dbPegout?.length ?? 0}, 'Not found any pegout related to this output');
        continue;
      }
      this.logger.debug({method: 'processSignedStatusByRtx', originatingRskTxHash: thePegout.originatingRskTxHash}, 'Found a pegout to be released');

      this.logPegoutData(thePegout);

      const newPegoutStatus = PegoutStatusDbDataModel.clonePegoutStatusInstance(thePegout);
      newPegoutStatus.setRskTxInformation(extendedBridgeTx);
      newPegoutStatus.btcRawTransaction = rawTx;
      // getId() is the canonical big-endian txid; getHash() is the internal
      // little-endian hash, which no explorer or Bitcoin node resolves.
      newPegoutStatus.btcTxHash = parsedBtcTransaction.getId();
      newPegoutStatus.isNewestStatus = true;
      newPegoutStatus.status = PegoutStatuses.RELEASE_BTC;
      newPegoutStatus.valueInSatoshisToBeReceived = output.value;
      newPegoutStatus.feeInSatoshisToBePaid = newPegoutStatus.valueRequestedInSatoshis - newPegoutStatus.valueInSatoshisToBeReceived;
      newPegoutStatus.btcRawTxInputsHash = this.getInputsHash(parsedBtcTransaction);
      newPegoutStatus.rskTxHash = `${extendedBridgeTx.txHash}___${thePegout.batchPegoutIndex}`;

      this.logPegoutData(newPegoutStatus);
      this.logger.debug({method: 'processSignedStatusByRtx'}, 'PegOut being released');
      try {
        thePegout.isNewestStatus = false;
        await this.save(thePegout);
        await this.save(newPegoutStatus);
        await this.publishAtlasEvent(newPegoutStatus, {
          receivedCreatedOn: await this.getReceivedCreatedOn(newPegoutStatus.originatingRskTxHash),
        });
      } catch(e) {
        this.logger.warn({method: 'processSignedStatusByRtx', err: e}, 'There was a problem with the storage');
      }
    }
  }

  /**
   * Picks which peg-out a `release_btc` output belongs to.
   *
   * A single match is unambiguous. When a batch pays the same Bitcoin address
   * more than once — the same user requesting two peg-outs to one address — the
   * lookup by recipient returns several rows, and the tie is broken by
   * `batchPegoutIndex`, which the Bridge assigns in the same order as the
   * outputs of the batch transaction.
   *
   * Before this disambiguation both rows were skipped, so peg-outs that really
   * were paid on Bitcoin never left `WAITING_FOR_SIGNATURE`.
   *
   * The index is compared numerically on purpose: `PegoutStatusDbDataModel`
   * types it as a number, but the Mongo schema stores it as a String, so rows
   * read back from the database carry `"0"` rather than `0`.
   *
   * @param candidates - Rows matching the recipient address and the batch tx.
   * @param outputIndex - Index of the output being processed.
   * @returns The peg-out that owns this output, or `undefined` when none does.
   */
  private selectPegoutForOutput(
    candidates: PegoutStatusDbDataModel[] | undefined,
    outputIndex: number,
  ): PegoutStatusDbDataModel | undefined {
    if (!candidates || candidates.length === 0) {
      return undefined;
    }
    if (candidates.length === 1) {
      return candidates[0];
    }
    return candidates.find(pegout => Number(pegout.batchPegoutIndex) === outputIndex);
  }

  private async processBatchPegouts(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    this.logger.debug({method: 'processBatchPegouts', txHash: extendedBridgeTx.txHash}, 'Started');
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
      this.logger.debug({method: 'processBatchPegouts', txHash: extendedBridgeTx.txHash, originatingRskTxHash}, 'Processing individual pegout creation in batch');

      const oldPegoutStatus  = await this.pegoutStatusDataService.getLastByOriginatingRskTxHashNewest(originatingRskTxHash);

      if(!oldPegoutStatus) {
        this.logger.warn({method: 'processBatchPegouts', originatingRskTxHash}, 'Could not find a pegout status record in the db');
        break;
      }

      this.logger.debug({method: 'processBatchPegouts'}, 'Got the pegout previous state from the db');

      const newClonedPegoutStatus = PegoutStatusDbDataModel.clonePegoutStatusInstance(oldPegoutStatus);
      newClonedPegoutStatus.setRskTxInformation(extendedBridgeTx);
      newClonedPegoutStatus.status = PegoutStatuses.WAITING_FOR_CONFIRMATION;
      newClonedPegoutStatus.isNewestStatus = true;
      // Many pegouts with HOP will share the same rskTxHash, so, appending the index to differentiate them
      // and make each have a unique rskTxHash that includes to which btc tx output index each pegout belongs
      newClonedPegoutStatus.rskTxHash = `${extendedBridgeTx.txHash}_${index}`;
      newClonedPegoutStatus.btcTxHash = btcTxHash;
      newClonedPegoutStatus.btcRecipientAddress = oldPegoutStatus.btcRecipientAddress;
      newClonedPegoutStatus.batchPegoutIndex = index;
      newClonedPegoutStatus.batchPegoutRskTxHash = extendedBridgeTx.txHash;

      this.logPegoutData(newClonedPegoutStatus);
      this.logger.debug({method: 'processBatchPegouts', amountInWeis: (await this.getTxFromRskTransaction(originatingRskTxHash)).valueInWeis}, 'PegOut waiting for confirmations');

      await this.addBatchValueInSatoshisToBeReceivedAndFee(newClonedPegoutStatus, extendedBridgeTx.txHash, extendedBridgeTx.blockNumber);

      try {
        // Update previous status as outdated
        oldPegoutStatus.isNewestStatus = false;
        const allPegouts = [oldPegoutStatus, newClonedPegoutStatus];
        await this.saveMany(allPegouts);
        this.logger.debug({method: 'processBatchPegouts', count: allPegouts.length}, 'Pegouts were updated');
        await this.publishAtlasEvent(newClonedPegoutStatus);
      } catch(e) {
        this.logger.warn({method: 'processBatchPegouts', err: e}, 'There was a problem with the storage');
      }
      eventData = eventData.replace(hashData, '');
      index++;
    }

  }

  private async addBatchValueInSatoshisToBeReceivedAndFee(
    pegoutStatus: PegoutStatusDbDataModel,
    txHash: string, blockNumber: number,
  ): Promise<void> {
      try {
        const bridgeState = await this.bridgeService.getBridgeState(blockNumber);
        const batchedPegout = bridgeState.pegoutsWaitingForConfirmations.find(pegout => ensureRskHashLength(pegout.rskTxHash) === remove0x(txHash));

        if(!batchedPegout) {
          this.logger.debug({method: 'addBatchValueInSatoshisToBeReceivedAndFee', txHash, originatingRskTxHash: pegoutStatus.originatingRskTxHash}, 'Did not find the batched pegout in the bridge state pegoutsWaitingForConfirmations');
          return;
        }
        this.logger.debug({method: 'addBatchValueInSatoshisToBeReceivedAndFee', txHash, originatingRskTxHash: pegoutStatus.originatingRskTxHash}, 'Got the batched pegout in the bridge state pegoutsWaitingForConfirmations');

        const parsedBtcTransaction = bitcoin.Transaction.fromHex(batchedPegout.btcRawTx);

        const output = parsedBtcTransaction.outs[pegoutStatus.batchPegoutIndex];
        pegoutStatus.valueInSatoshisToBeReceived = output.value;
        pegoutStatus.feeInSatoshisToBePaid = pegoutStatus.valueRequestedInSatoshis - pegoutStatus.valueInSatoshisToBeReceived;
        pegoutStatus.btcRawTransaction = batchedPegout.btcRawTx;
        pegoutStatus.btcRawTxInputsHash = this.getInputsHash(parsedBtcTransaction);
    } catch(e) {
      this.logger.warn({method: 'addBatchValueInSatoshisToBeReceivedAndFee', err: e}, 'Error occurred');
    }
  }

  private getInputsHash(btcTx: bitcoin.Transaction) {
    const concatenatedBtcTxInputHashes = btcTx.ins.reduce((acc, input) => `${acc}${input.hash.toString('hex')}`, '');
    return sha256(concatenatedBtcTxInputHashes);
  }

  private async processPegoutConfirmedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const currentBlockHeight = extendedBridgeTx.blockNumber;
    this.logger.debug({method: 'processPegoutConfirmedStatus', currentBlockHeight}, 'Current block height');
    const pegoutConfirmedEvent = extendedBridgeTx.events.find(event => event.name === BRIDGE_EVENTS.PEGOUT_CONFIRMED) as ExtendedBridgeEvent;
    const { pegoutCreationRskBlockNumber } = pegoutConfirmedEvent.arguments;
    this.logger.debug({method: 'processPegoutConfirmedStatus', pegoutCreationRskBlockNumber}, 'Pegout creation rsk block number');
    const dbPegoutsWaitingForConfirmations = await this.pegoutStatusDataService.getManyWaitingForConfirmationNewestCreatedOnBlock(pegoutCreationRskBlockNumber);
    this.logger.debug({method: 'processPegoutConfirmedStatus', count: dbPegoutsWaitingForConfirmations.length}, 'Number of pegouts waiting for confirmations');
    return this.changePegoutsToWaitingForSignatures(dbPegoutsWaitingForConfirmations, extendedBridgeTx);
  }

  private async changePegoutsToWaitingForSignatures(dbPegoutsWaitingForConfirmations: PegoutStatusDbDataModel[], extendedBridgeTx: ExtendedBridgeTx) {
    let index = 0;
    for (let oldStatus of dbPegoutsWaitingForConfirmations) {
      const newStatus = PegoutStatusDbDataModel.clonePegoutStatusInstance(oldStatus);
      newStatus.setRskTxInformation(extendedBridgeTx);
      newStatus.rskTxHash = `${extendedBridgeTx.txHash}__${index}`;
      newStatus.isNewestStatus = true;
      newStatus.status = PegoutStatuses.WAITING_FOR_SIGNATURE;
      oldStatus.isNewestStatus = false;
      try {
        await this.saveMany([oldStatus, newStatus]);
      } catch (e) {
        this.logger.warn({method: 'changePegoutsToWaitingForSignatures', err: e}, 'There was a problem with the storage');
      }
      index++;
    }
  }

  private async processIndividualPegout(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const releaseRequestedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUESTED);

    this.logger.debug({method: 'processIndividualPegout', txHash: extendedBridgeTx.txHash}, 'Started');

    if(!releaseRequestedEvent) {
      return;
    }

    const originatingRskTxHash = <string> releaseRequestedEvent.arguments.rskTxHash;
    const btcTxHash = <string> releaseRequestedEvent.arguments.btcTxHash;

    // TODO: Every pegout after HOP will fail to be found in this way. Consider removing this logic.
    const oldPegoutStatus = await this.pegoutStatusDataService.getLastByOriginatingRskTxHashNewest(originatingRskTxHash);

    if(!oldPegoutStatus) {
      return this.logger.warn({method: 'processIndividualPegout', originatingRskTxHash}, 'Pegout request for this pegout creation not found (most likely migration or pegin rejection). Processor will not store this pegout');
    }

    oldPegoutStatus.isNewestStatus = false;

    const newPegoutStatus: PegoutStatusDbDataModel = PegoutStatusDbDataModel.clonePegoutStatusInstance(oldPegoutStatus);
    newPegoutStatus.setRskTxInformation(extendedBridgeTx);
    newPegoutStatus.originatingRskTxHash = originatingRskTxHash;
    newPegoutStatus.btcTxHash = btcTxHash;
    newPegoutStatus.status = PegoutStatuses.WAITING_FOR_CONFIRMATION;
    newPegoutStatus.isNewestStatus = true;

    this.logPegoutData(newPegoutStatus);
    this.logger.debug({method: 'processIndividualPegout', amountInWeis: (await this.getTxFromRskTransaction(originatingRskTxHash)).valueInWeis}, 'PegOut waiting for confirmation');

    await this.addValueInSatoshisToBeReceivedAndFee(newPegoutStatus);

    try {
      await this.save(oldPegoutStatus);
      await this.save(newPegoutStatus);
      await this.publishAtlasEvent(newPegoutStatus);
    } catch(e) {
      this.logger.warn({method: 'processIndividualPegout', err: e}, 'There was a problem with the storage');
    }
  }

  private async addValueInSatoshisToBeReceivedAndFee(pegoutStatus: PegoutStatusDbDataModel): Promise<void> {
    const rskTxHash = remove0x(pegoutStatus.originatingRskTxHash);
    const bridgeState = await this.bridgeService.getBridgeState();

    this.logger.debug({method: 'addValueInSatoshisToBeReceivedAndFee', rskTxHash}, 'Searching for a pegout in the bridge state pegoutsWaitingForConfirmations');

    const pegout = bridgeState.pegoutsWaitingForConfirmations.find((pegout: any) => pegout.rskTxHash === rskTxHash);

    if(!pegout) {
      this.logger.debug({method: 'addValueInSatoshisToBeReceivedAndFee'}, 'Did not find the pegout in the bridge state pegoutsWaitingForConfirmations');
      return;
    }

    this.logger.debug(
      {method: 'addValueInSatoshisToBeReceivedAndFee', pegoutCreationBlockNumber: pegout.pegoutCreationBlockNumber},
      'Found a pegout in waiting for confirmations at block',
    );
    const parsedBtcTransaction = bitcoin.Transaction.fromHex(pegout.btcRawTx);
    const output = parsedBtcTransaction.outs.find(out => {
      const parsedBtcAddress = bitcoin.address.fromOutputScript(out.script, this.getBitcoinNetwork());
      return parsedBtcAddress === pegoutStatus.btcRecipientAddress;
    });

    if(!output) {
      this.logger.debug({method: 'addValueInSatoshisToBeReceivedAndFee', btcRecipientAddress: pegoutStatus.btcRecipientAddress}, 'Did not find an output containing the btcRecipientAddress');
      return;
    }

    pegoutStatus.valueInSatoshisToBeReceived = output.value;
    pegoutStatus.feeInSatoshisToBePaid = pegoutStatus.valueRequestedInSatoshis - pegoutStatus.valueInSatoshisToBeReceived;
    pegoutStatus.btcRawTransaction = pegout.btcRawTx;
  }

  private async processReleaseRequestReceivedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const releaseRequestReceivedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);

    if(!releaseRequestReceivedEvent) {
      return;
    }

    const status = await PegoutStatusBuilder.fillRequestReceivedStatus(extendedBridgeTx);
    this.logPegoutData(status);
    this.logger.debug({method: 'processReleaseRequestReceivedStatus', amount: releaseRequestReceivedEvent.arguments.amount}, 'New PegOut received');

    try {
      await this.save(status);
      this.logger.debug({method: 'processReleaseRequestReceivedStatus', txHash: extendedBridgeTx.txHash}, 'Tx registered');
      await this.publishAtlasEvent(status);
    } catch(e) {
      this.logger.warn({method: 'processReleaseRequestReceivedStatus', err: e}, 'There was a problem with the storage');
    }
  }

  private async processReleaseRequestRejectedStatus(extendedBridgeTx: ExtendedBridgeTx): Promise<void> {
    const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
    const releaseRequestRejectedEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);

    if(!releaseRequestRejectedEvent) {
      return;
    }

   const status = await PegoutStatusBuilder.fillRequestRejectedStatus(extendedBridgeTx);
   this.logPegoutData(status);
   this.logger.debug({method: 'processReleaseRequestRejectedStatus', amount: releaseRequestRejectedEvent.arguments.amount}, 'PegOut rejected');

    try {
      await this.save(status);
      this.logger.debug({method: 'processReleaseRequestRejectedStatus', txHash: extendedBridgeTx.txHash}, 'Tx registered');
      await this.publishAtlasEvent(status);
    } catch(e) {
      this.logger.warn({method: 'processReleaseRequestRejectedStatus', err: e}, 'There was a problem with the storage');
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
    this.logger.info({method: 'save'}, 'Pegout saved on the storage');
    this.logPegoutData(pegout);
    return this.pegoutStatusDataService.set(pegout);
  }

  /**
   * Publishes the Atlas SWAP event of a peg-out transition that has already
   * been written to the database. Statuses with no equivalent in the v1.0
   * schema (e.g. `WAITING_FOR_SIGNATURE`) publish nothing.
   *
   * Nothing here is allowed to fail the caller: a peg-out status is never
   * rolled back because analytics could not be notified.
   *
   * @param pegout - The status just persisted.
   * @param context - Extra data the builder cannot derive from `pegout` alone.
   */
  private async publishAtlasEvent(
    pegout: PegoutStatusDbDataModel,
    context?: PegoutAtlasEventContext,
  ): Promise<void> {
    try {
      const event = PegoutAtlasEventBuilder.build(pegout, context);
      if (!event) {
        return;
      }
      await this.atlasEventPublisher.publish(event);
    } catch (e) {
      this.logger.error(
        {method: 'publishAtlasEvent', err: e, originatingRskTxHash: pegout.originatingRskTxHash},
        'Could not build or publish the Atlas event',
      );
    }
  }

  /**
   * Looks up when the peg-out was first received, so `swap.completed` can carry
   * the elapsed time of the whole peg-out rather than of its last transition.
   *
   * @param originatingRskTxHash - The peg-out identifier.
   * @returns The `createdOn` of the `RECEIVED` status, or `undefined` when it cannot be found.
   */
  private async getReceivedCreatedOn(originatingRskTxHash: string): Promise<Date | undefined> {
    try {
      const statuses = await this.pegoutStatusDataService.getManyByOriginatingRskTxHash(originatingRskTxHash) ?? [];
      return statuses.find(status => status.status === PegoutStatuses.RECEIVED)?.createdOn;
    } catch (e) {
      this.logger.warn(
        {method: 'getReceivedCreatedOn', err: e, originatingRskTxHash},
        'Could not read the RECEIVED status to compute the pegout duration',
      );
      return undefined;
    }
  }

  private logPegoutData(pegout: PegoutStatusDbDataModel) {
    try {
      this.logger.debug({method: 'logPegoutData', status: pegout.status}, 'Pegout data');
    }
    catch(e) {
      this.logger.error({method: 'logPegoutData', err: e}, 'There was a problem with the conversion of pegout');
    }
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

  private async getTxFromRskTransaction(rskTxHash: string): Promise<FullRskTransaction> {
    const web3: Web3 = new Web3(`${process.env.RSK_NODE_HOST}`)
    const web3Tx = await web3.eth.getTransaction(rskTxHash);
    return FullRskTransaction.fromWeb3TransactionWithValue(web3Tx);
  }

}
