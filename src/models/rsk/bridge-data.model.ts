import {RskBlock} from './rsk-block.model';
import {RskTransaction} from './rsk-transaction.model';
export class BridgeData {
  data: Array<RskTransaction>;
  block: RskBlock;

  constructor() {
    this.data = [];
  }
}
