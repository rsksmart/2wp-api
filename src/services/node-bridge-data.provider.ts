import {inject} from '@loopback/core';
import * as precompiledAbis from '@rsksmart/rsk-precompiled-abis';
import {getLogger, Logger} from '../utils/logger';
import {isSuccessfulReceipt} from '../utils/bridge-utils';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {RskBlock} from '../models/rsk/rsk-block.model';
import FilteredBridgeTransactionProcessor from './filtered-bridge-transaction-processor';
import RskBlockProcessorPublisher from './rsk-block-processor-publisher';
import {BridgeService} from './bridge.service';
import {RskNodeService} from './rsk-node.service';
import ExtendedBridgeTx from './extended-bridge-tx';

export class NodeBridgeDataProvider implements RskBlockProcessorPublisher {
  logger: Logger;
  filters: Array<BridgeDataFilterModel>;
  private subscribers: FilteredBridgeTransactionProcessor[];
  bridgeService: BridgeService
  rskNodeService: RskNodeService

  constructor(
    @inject(ServicesBindings.BRIDGE_SERVICE)
    bridgeService: BridgeService,
    @inject(ServicesBindings.RSK_NODE_SERVICE)
    rskNodeService: RskNodeService
  ) {
    this.filters = [];
    this.logger = getLogger('nodeBridgeDataProvider');
    this.subscribers = [];
    this.bridgeService = bridgeService;
    this.rskNodeService = rskNodeService;
  }

  /**
   * Subscribers interested in a transaction, decided from its raw selector
   * alone. A subscriber declaring no filters is interested in everything.
   *
   * @param callData - Raw transaction input. Never decoded here.
   * @returns The subscribers that want this transaction.
   */
  private interestedSubscribers(callData: string): FilteredBridgeTransactionProcessor[] {
    return this.subscribers.filter(subscriber => {
      const filters = subscriber.getFilters();
      return filters.length === 0 || filters.some(f => f.isMethodCall(callData));
    });
  }

  async process(rskBlock: RskBlock): Promise<void> {
    this.logger.debug({method: 'process', blockHash: rskBlock.hash}, 'Processing rskBlock');
    for(const transaction of rskBlock.transactions) {
      if (transaction.to !== precompiledAbis.bridge.address) {
        continue;
      }
      this.logger.debug({method: 'process', txHash: transaction.hash, signature: transaction.data.substring(0, 10)}, 'Found a bridge tx');

      // Decide interest from the raw selector, before anything is decoded. Most
      // Bridge methods have no subscriber, so this drops them for the cost of a
      // string comparison — and it keeps their calldata away from the ABI
      // decoder entirely.
      const interested = this.interestedSubscribers(transaction.data);
      if (interested.length === 0) {
        this.logger.debug({method: 'process', txHash: transaction.hash}, 'No subscriber matches this method, skipping');
        continue;
      }

      // Only decode what the EVM actually accepted. A reverted call proves
      // nothing about its arguments, and decoding one can be made to allocate
      // without bound. Skipping rather than throwing keeps a single hostile
      // transaction from stopping the chain sync.
      const receipt = await this.rskNodeService.getTransactionReceipt(transaction.hash);
      if (!isSuccessfulReceipt(receipt)) {
        this.logger.warn({method: 'process', txHash: transaction.hash}, 'Bridge tx did not execute successfully, skipping');
        continue;
      }

      const bridgeTx = await this.bridgeService.getBridgeTransactionByHash(transaction.hash);
      if (!bridgeTx) {
        this.logger.warn({method: 'process', txHash: transaction.hash}, 'Bridge tx not found, skipping');
        continue;
      }
      const extendedBridgeTx: ExtendedBridgeTx = {
        ...bridgeTx,
        blockHash: transaction.blockHash,
        createdOn: transaction.createdOn,
        to: <string> transaction.to,
      };
      for(const subscriber of interested) {
        this.logger.debug({method: 'process', txHash: transaction.hash}, 'Informing subscriber');
        await subscriber.process(extendedBridgeTx);
      }
    }
  }

  addSubscriber(dataProcessorSubscriber: FilteredBridgeTransactionProcessor): void {
    const foundSubscriber = this.subscribers.find(dps => dps === dataProcessorSubscriber);
    if(!foundSubscriber) {
      this.subscribers.push(dataProcessorSubscriber);
    }
  }

  removeSubscriber(dataProcessorSubscriber: FilteredBridgeTransactionProcessor): void {
    const foundSubscriberIndex = this.subscribers.findIndex(dps => dps === dataProcessorSubscriber);
    if(foundSubscriberIndex !== -1) {
      this.subscribers.splice(foundSubscriberIndex, 1);
    }
  }

  getSubscribers(): FilteredBridgeTransactionProcessor[] {
    return this.subscribers;
  }

}
