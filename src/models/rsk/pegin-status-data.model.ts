import {SearchableModel} from './searchable-model';

export class PeginStatusDataModel implements SearchableModel {
  btcTxId: string;
  status: string; // TODO: this should be an enum
  rskBlockHeight: number;
  rskTxId: string;
  rskRecipient: string;
  createdOn: Date;
  // TODO: add value field => value: BigInt;

  getId() {
    return this.btcTxId;
  }
  getIdFieldName(): string {
    return 'btcTxId';
  }
}
