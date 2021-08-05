import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {BridgeData} from '../models/rsk/bridge-data.model';
import {Log} from '../models/rsk/log.model';
import {RskBlock} from '../models/rsk/rsk-block.model';
import {RskTransaction} from '../models/rsk/rsk-transaction.model';
import {getMetricLogger} from '../utils/metric-logger';
import {RskBridgeDataProvider} from './rsk-bridge-data.provider';
import {RskNodeService} from './rsk-node.service';

export class NodeBridgeDataProvider implements RskBridgeDataProvider {
  rskNodeService: RskNodeService;
  logger: Logger;
  filters: Array<BridgeDataFilterModel>;
  constructor(
    @inject(ServicesBindings.RSK_NODE_SERVICE)
    rskNodeService: RskNodeService
  ) {
    this.rskNodeService = rskNodeService;
    this.filters = [];
    this.logger = getLogger('nodeBridgeDataProvider');
  }
  async getData(startingBlock: string | number): Promise<BridgeData> {
    const metricLogger = getMetricLogger(this.logger, 'getData');
    const data: BridgeData = new BridgeData();
    const lastBlock = await this.rskNodeService.getBlock(startingBlock);
    if (lastBlock == null) {
      throw new Error(`Block ${startingBlock} doesn't exist`);
    }
    data.block = new RskBlock(
      lastBlock.number,
      lastBlock.hash,
      lastBlock.parentHash
    );
    for (const transaction of lastBlock.transactions) {
      // TODO: determine why using the precompiled abis reference is not working
      if (transaction.to !== '0x0000000000000000000000000000000001000006') {
        continue;
      }

      this.logger.trace(`Found a bridge tx ${transaction.hash} with signature ${transaction.input.substring(0, 10)}`);

      if (this.filters.length == 0 ||
        this.filters.some(f => f.isMethodCall(transaction.input))
      ) {
        this.logger.debug(`Tx ${transaction.hash} matches filters`);

        const tx = new RskTransaction();
        tx.blockHeight = lastBlock.number;
        tx.blockHash = lastBlock.hash;
        tx.createdOn = new Date(lastBlock.timestamp * 1000);
        tx.hash = transaction.hash;
        tx.data = transaction.input;
        const txReceipt = await this.rskNodeService.getTransactionReceipt(tx.hash.toString('hex'));
        tx.logs = <Array<Log>>txReceipt.logs;
        data.data.push(tx);
      }
    }

    metricLogger();
    return Promise.resolve(data);
  }

  configure(filters: Array<BridgeDataFilterModel>): void {
    this.filters = filters || [];
  }

}
