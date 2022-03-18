import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {Log} from '../models/rsk/log.model';
import {RskBlock} from '../models/rsk/rsk-block.model';
import {RskNodeService} from './rsk-node.service';
import FilteredBridgeTransactionProcessor from './filtered-bridge-transaction-processor';
import RskBlockProcessorPublisher from './rsk-block-processor-publisher';

export class NodeBridgeDataProvider implements RskBlockProcessorPublisher {
  rskNodeService: RskNodeService;
  logger: Logger;
  filters: Array<BridgeDataFilterModel>;
  private subscribers: FilteredBridgeTransactionProcessor[];
  constructor(
    @inject(ServicesBindings.RSK_NODE_SERVICE)
    rskNodeService: RskNodeService
  ) {
    this.rskNodeService = rskNodeService;
    this.filters = [];
    this.logger = getLogger('nodeBridgeDataProvider');
    this.subscribers = [];
  }

  async process(rskBlock: RskBlock): Promise<void> {
    console.log("NodeBridgeDataProvider::process rskBlock: ", rskBlock)
    this.logger.debug(`[process] Processing rskBlock ${rskBlock.hash}`);
    for(const transaction of rskBlock.transactions) {
      console.log("NodeBridgeDataProvider::process for transaction: ", transaction)
      for(const subscriber of this.subscribers) {
        console.log("NodeBridgeDataProvider::process for subscriber: ", subscriber)
        const filters = await subscriber.getFilters();
        console.log("NodeBridgeDataProvider::process for filters: ", filters)
        if (filters.length === 0 || filters.some(f => f.isMethodCall(transaction.data))) {
          this.logger.debug(`[process] Tx ${transaction.hash} matches filters`);
          const txReceipt = await this.rskNodeService.getTransactionReceipt(transaction.hash);
          const logs = <Array<Log>>txReceipt.logs;
          console.log("NodeBridgeDataProvider::process for logs.length: ", logs.length)
          transaction.logs.push(...logs);
          subscriber.process(transaction);
        }
      }
    }
  }

  addSubscriber(dataProcessorSubscriber: FilteredBridgeTransactionProcessor): void {
    console.log("adding subscriber: ", dataProcessorSubscriber)
    const foundSubscriber = this.subscribers.find(dps => dps === dataProcessorSubscriber);
    if(!foundSubscriber) {
      this.subscribers.push(dataProcessorSubscriber);
    }
  }

  removeSubscriber(dataProcessorSubscriber: FilteredBridgeTransactionProcessor): void {
    console.log("removing subscriber: ", dataProcessorSubscriber)
    const foundSubscriberIndex = this.subscribers.findIndex(dps => dps === dataProcessorSubscriber);
    if(foundSubscriberIndex !== -1) {
      this.subscribers.splice(foundSubscriberIndex, 1);
    }
  }

  getSubscribers(): FilteredBridgeTransactionProcessor[] {
    return this.subscribers;
  }

}
