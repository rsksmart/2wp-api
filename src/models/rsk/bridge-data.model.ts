import {Block} from './block.model';
import {Transaction} from './transaction.model';
export class BridgeData {
  data: Array<Transaction>;
  block: Block;

  constructor() {
    this.data = [];
  }
}
