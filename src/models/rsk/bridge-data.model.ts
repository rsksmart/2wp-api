import {Transaction} from './transaction.model';
export class BridgeData {
  data: Array<Transaction>;
  maxBlockHeight: number; // TODO: This should be a complete block

  constructor() {
    this.data = [];
  }
}
