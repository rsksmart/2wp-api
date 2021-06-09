import {Model, model, property} from '@loopback/repository';

@model()
export class PeginStatus extends Model {
  @property({
    type: 'string',
  })
  btcTxId: string;

  @property({
    type: 'Status',
  })
  status: Status;

  @property({
    type: 'number',
  })
  rskBlockHeight: number;

  @property({
    type: 'string',
  })
  rskTxId: string;

  @property({
    type: 'string',
  })
  rskRecipient?: string;

  @property({
    type: 'number',
  })
  btcConfirmation?: number;

  constructor(txId: string) {
    super();
    this.btcTxId = txId;
  }
}

export enum Status {
  waiting_confirmations,
  confirmed,
  rejected_no_refund,
  rejected_refund
}

export type PeginStatusWithRelations = PeginStatus;
