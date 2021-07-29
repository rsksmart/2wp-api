import {SearchableModel} from './searchable-model';

export enum PeginStatus {
  LOCKED = 'LOCKED',
  REJECTED_NO_REFUND = 'REJECTED_NO_REFUND',
  REJECTED_REFUND = 'REJECTED_REFUND'
}

export class PeginStatusDataModel implements SearchableModel {
  btcTxId: string;
  status: PeginStatus;
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
