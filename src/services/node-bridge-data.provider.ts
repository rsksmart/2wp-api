import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {RskBlock} from '../models/rsk/rsk-block.model';
import FilteredBridgeTransactionProcessor from './filtered-bridge-transaction-processor';
import RskBlockProcessorPublisher from './rsk-block-processor-publisher';
import {bridge} from '@rsksmart/rsk-precompiled-abis';
import {BridgeService} from './bridge.service';
import ExtendedBridgeTx from './extended-bridge-tx';

export class NodeBridgeDataProvider implements RskBlockProcessorPublisher {
  logger: Logger;
  filters: Array<BridgeDataFilterModel>;
  private subscribers: FilteredBridgeTransactionProcessor[];
  bridgeService: BridgeService

  constructor(
    @inject(ServicesBindings.BRIDGE_SERVICE)
    bridgeService: BridgeService
  ) {
    this.filters = [];
    this.logger = getLogger('nodeBridgeDataProvider');
    this.subscribers = [];
    this.bridgeService = bridgeService;
  }

  async process(rskBlock: RskBlock): Promise<void> {
    this.logger.debug(`[process] Processing rskBlock ${rskBlock.hash}`);
    for(const transaction of rskBlock.transactions) {
      if (transaction.to !== bridge.address) {
        // eslint-disable-next-line no-continue
        continue;
      }
      this.logger.trace(`Found a bridge tx ${transaction.hash} 
        with signature ${transaction.data.substring(0, 10)}`);
      const bridgeTx = await this.bridgeService.getBridgeTransactionByHash(transaction.hash);
      for(const subscriber of this.subscribers) {
        const filters = await subscriber.getFilters();
        if (filters.length === 0 || filters.some((f) => f.isMethodCall(transaction.data))) {
          this.logger.debug(`[process] Tx ${transaction.hash} matches filters`);
          const extendedBridgeTx: ExtendedBridgeTx = {
            ...bridgeTx,
            blockHash: transaction.blockHash,
            createdOn: transaction.createdOn,
            to: <string> transaction.to,
          };
          this.logger.debug(`[process] Informing subscriber...`);
          await subscriber.process(extendedBridgeTx);
        }
      }
    }
  }

  addSubscriber(dataProcessorSubscriber: FilteredBridgeTransactionProcessor): void {
    const foundSubscriber = this.subscribers.find((dps) => dps === dataProcessorSubscriber);
    if(!foundSubscriber) {
      this.subscribers.push(dataProcessorSubscriber);
    }
  }

  removeSubscriber(dataProcessorSubscriber: FilteredBridgeTransactionProcessor): void {
    const foundSubscriberIndex = this.subscribers.findIndex((dps) => dps === dataProcessorSubscriber);
    if(foundSubscriberIndex !== -1) {
      this.subscribers.splice(foundSubscriberIndex, 1);
    }
  }

  getSubscribers(): FilteredBridgeTransactionProcessor[] {
    return this.subscribers;
  }

}
