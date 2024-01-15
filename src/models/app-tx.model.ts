import {SearchableModel} from './rsk/searchable-model';

export class AppTxModel implements SearchableModel {
  txHash: string;
  type: string;
  creationDate: Date;
  value: number;
  wallet: string;
  addressType: string;
  fee: number;
  rskGas: number;
  btcEstimatedFee: number;

  getId() {
    return this.txHash;
  }
  getIdFieldName(): string {
    return 'txHash';
  }
}
