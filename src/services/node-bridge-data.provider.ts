import {inject} from '@loopback/core';
import * as precompiledAbis from '@rsksmart/rsk-precompiled-abis';
import {getLogger, Logger} from '../utils/logger';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {RskBlock} from '../models/rsk/rsk-block.model';
import FilteredBridgeTransactionProcessor from './filtered-bridge-transaction-processor';
import RskBlockProcessorPublisher from './rsk-block-processor-publisher';
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
    this.logger.debug({method: 'process', blockHash: rskBlock.hash}, 'Processing rskBlock');
    for(const transaction of rskBlock.transactions) {
      if (transaction.to !== precompiledAbis.bridge.address) {
        continue;
      }
      this.logger.debug({method: 'process', txHash: transaction.hash, signature: transaction.data.substring(0, 10)}, 'Found a bridge tx');
      const bridgeTx = await this.bridgeService.getBridgeTransactionByHash(transaction.hash);
      if (!bridgeTx) {
        this.logger.warn({method: 'process', txHash: transaction.hash}, 'Bridge tx not found, skipping');
        continue;
      }
      for(const subscriber of this.subscribers) {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        const filters = await subscriber.getFilters();
        if (filters.length === 0 || filters.some(f => f.isMethodCall(transaction.data))) {
          this.logger.debug({method: 'process', txHash: transaction.hash}, 'Tx matches filters');
          const extendedBridgeTx: ExtendedBridgeTx = {
            ...bridgeTx,
            blockHash: transaction.blockHash,
            createdOn: transaction.createdOn,
            to: <string> transaction.to,
          };
          this.logger.debug({method: 'process', txHash: transaction.hash}, 'Informing subscriber');
          await subscriber.process(extendedBridgeTx);
        }
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
