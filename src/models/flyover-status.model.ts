import {SearchableModel} from './rsk/searchable-model';

export class FlyoverStatusModel implements SearchableModel {
  txHash: string;
  type: string;
  date: Date;
  amount: number;
  fee: number;
  blockToBeFinished: number;

  getId() {
    return this.txHash;
  }
  getIdFieldName(): string {
    return 'txHash';
  }
}