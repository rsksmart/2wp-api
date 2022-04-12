import { SearchableModel } from './searchable-model';

export enum PegoutStatus {
    RECEIVED = 'RECEIVED',
    REJECTED = 'REJECTED',
    CREATED = 'CREATED',
    WAITING_FOR_SIGNATURE = 'WAITING_FOR_SIGNATURE',
    SIGNED = 'SIGNED'
}

export class PegoutStatusDataModel implements SearchableModel {
    rskTxhash: string;
    rskSenderAddress: string;
    btcRecipientAddress: string;
    valueInWeisSentToTheBridge: number;
    valueInSatoshisToBeReceived: number;
    feeInSatoshisToBePaid: number;
    status: PegoutStatus;
    btcRawTransaction: string;
    lastUpdatedOn: Date;
  getId() {
    return this.rskTxhash;
  }
  getIdFieldName(): string {
    return 'rskTxhash';
  }
}
