import {Log} from './log.model';

export class RskTransaction {
  hash: string;
  blockHash: string;
  blockHeight: number;
  data: string;
  logs: Array<Log>;
  createdOn: Date;

  constructor() {
    this.logs = [];
  }
}
