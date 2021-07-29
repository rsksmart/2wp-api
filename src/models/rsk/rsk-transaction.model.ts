import {Log} from './log.model';

export class RskTransaction {
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
