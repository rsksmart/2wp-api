import {SearchableModel} from './searchable-model';

export class SyncStatusModel implements SearchableModel {

  rskBlockHash: string;

  rskBlockHeight: number;

  rskBlockParentHash: string;

  constructor(rskBlockHash: string, rskBlockHeight: number, rskBlockParentHash: string) {
    this.rskBlockHash = rskBlockHash;
    this.rskBlockHeight = rskBlockHeight;
    this.rskBlockParentHash = rskBlockParentHash;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getId(): any {
    return this.rskBlockHash;
  }

  getIdFieldName(): string {
    return 'rskBlockHash';
  }

  toString(): string {
    return `{hash:${this.rskBlockHash}, 
      parentHash:${this.rskBlockParentHash}, 
      height:${this.rskBlockHeight}}`;
  }

}
