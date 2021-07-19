import {getLogger, Logger} from 'log4js';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {BridgeData} from '../models/rsk/bridge-data.model';
import {Log} from '../models/rsk/log.model';
import {Transaction} from '../models/rsk/transaction.model';
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
    let data: BridgeData = new BridgeData();
    // this.logger.trace(`Fetching data for block ${startingBlock}`);
    let lastBlock = await this.rskNodeService.getBlock(startingBlock);
    if (lastBlock == null) {
      throw new Error(`Block ${startingBlock} doesn't exist`);
    }
    data.maxBlockHeight = lastBlock.number;
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

        let tx = new Transaction();
        tx.blockHeight = lastBlock.number;
        tx.blockHash = lastBlock.hash;
        tx.hash = transaction.hash;
        tx.data = transaction.input;
        let txReceipt = await this.rskNodeService.getTransactionReceipt(tx.hash.toString('hex'));
        tx.logs = <Array<Log>>txReceipt.logs;
        data.data.push(tx);
      }
    }

    return Promise.resolve(data);
  }

  configure(filters: Array<BridgeDataFilterModel>): void {
    this.filters = filters || [];
  }

}
