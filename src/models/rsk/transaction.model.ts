import {Log} from './log.model';

export class Transaction {
  hash: Buffer;
  blockHash: Buffer;
  blockHeight: number;
  data: Buffer;
  logs: Array<Log>;
  createdOn: Date;

  constructor() {
    this.logs = [];
  }
}
