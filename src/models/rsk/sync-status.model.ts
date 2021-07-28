import {SearchableModel} from './searchable-model';

export class SyncStatusModel implements SearchableModel {
  rskBlockHeight: number;
  rskBlockHash: string;
  rskBlockParentHash: string;

  getId(): any {
    return this.rskBlockHash;
  }

  getIdFieldName(): string {
    return 'rskBlockHash';
  }

  toString(): string {
    return `{hash:${this.rskBlockHash}, parentHash:${this.rskBlockParentHash}, height:${this.rskBlockHeight}}`;
  }
}
