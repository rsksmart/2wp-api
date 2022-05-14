import { SearchableModel } from './searchable-model';

export enum PegoutStatus {
  RECEIVED = 'RECEIVED',
  REJECTED = 'REJECTED',
  CREATED = 'CREATED',
  WAITING_FOR_CONFIRMATION = 'WAITING_FOR_CONFIRMATION',
  WAITING_FOR_SIGNATURE = 'WAITING_FOR_SIGNATURE',
  SIGNED = 'SIGNED'
}

export class PegoutStatusDataModel implements SearchableModel {
  originatingRskTxHash: string; // First pegout rskTxHash, the one the user should have.
  rskTxHash: string;
  rskSenderAddress: string;
  btcRecipientAddress: string;
  valueInWeisSentToTheBridge: string;
  valueInSatoshisToBeReceived: string;
  feeInSatoshisToBePaid: string;
  status: PegoutStatus;
  btcRawTransaction: string;
  rskBlockHeight: number;
  reason: string;
  createdOn: Date;
  btcTxHash: string;
  getId() {
    return this.rskTxHash;
  }
  getIdFieldName(): string {
    return 'rskTxHash';
  }
}
