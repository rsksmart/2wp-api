import {SearchableModel} from './searchable-model';

export class PegnatoriesStatusDataModel implements SearchableModel {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  pegnatoryAddress: string;
  signature: string;
  createdOn: Date;

  getId() {
    return this.txHash;
  }
  getIdFieldName(): string {
    return 'txHash';
  }
}
