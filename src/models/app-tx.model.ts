import {SearchableModel} from './rsk/searchable-model';

export class AppTxModel implements SearchableModel {
  txHash: string;
  type: string;
  creationDate: Date;
  value: string;
  wallet: string;
  addressType: string;
  fee: string;
  rskGas: string;
  btcEstimatedFee: string;
  provider: string;

  getId() {
    return this.txHash;
  }
  getIdFieldName(): string {
    return 'txHash';
  }
}
