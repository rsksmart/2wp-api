import {getLogger, Logger} from 'log4js';
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
  constructor() {
    this.rskNodeService = new RskNodeService();
    this.filters = [];
    this.logger = getLogger('nodeBridgeDataProvider');
  }
  async getData(startingBlock: string | number): Promise<BridgeData> {
    let metricLogger = getMetricLogger(this.logger, 'getData');
    let data: BridgeData = new BridgeData();
    let lastBlock = await this.rskNodeService.getBlock(startingBlock);
    if (lastBlock == null) {
      throw new Error(`Block ${startingBlock} doesn't exist`);
    }
    data.block = new RskBlock(
      lastBlock.number,
      lastBlock.hash,
      lastBlock.parentHash
    );
    for (let transaction of lastBlock.transactions) {
      // TODO: determine why using the precompiled abis reference is not working
      if (transaction.to !== '0x0000000000000000000000000000000001000006') {
        continue;
      }

      this.logger.trace(`Found a bridge tx ${transaction.hash} with signature ${transaction.input.substring(0, 10)}`);

      if (this.filters.length == 0 ||
        this.filters.some(f => f.isMethodCall(transaction.input))
      ) {
        this.logger.debug(`Tx ${transaction.hash} matches filters`);

        let tx = new RskTransaction();
        tx.blockHeight = lastBlock.number;
        tx.blockHash = lastBlock.hash;
        tx.createdOn = new Date(lastBlock.timestamp * 1000);
        tx.hash = transaction.hash;
        tx.data = transaction.input;
        let txReceipt = await this.rskNodeService.getTransactionReceipt(tx.hash.toString('hex'));
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
