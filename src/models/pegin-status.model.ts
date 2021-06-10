import {Model, model, property} from '@loopback/repository';

@model()
export class PeginStatus extends Model {
  @property({
    type: 'object',
  })
  btc: BtcPeginStatus;

  @property({
    type: 'object',
  })
  rsk: RskPeginStatus;

  @property({
    type: 'Status',
  })
  status: Status;

  constructor(btc: BtcPeginStatus, rsk: RskPeginStatus, status: Status) {
    super();
    this.btc = btc;
    this.rsk = rsk;
    this.status = status;
  }
}

@model()
export class BtcPeginStatus extends Model {
  @property({
    type: 'string',
  })
  txId: string;

  @property({
    type: 'string',
  })
  creationDate: string;  //TODO: Verify datatype

  @property({
    type: 'string',
  })
  federationAddress: string;

  @property({
    type: 'number',
  })
  amountTransferred: number;

  @property({
    type: 'string',
  })
  refundAddress: string;

  @property({
    type: 'number',
  })
  confirmations: number;

  @property({
    type: 'number',
  })
  requiredConfirmation: number;

  constructor(btcTxId: string) {
    super();
    this.txId = btcTxId;
  }
}

@model()
export class RskPeginStatus extends Model {
  @property({
    type: 'string',
  })
  recipientAddress: string;

  @property({
    type: 'number',
  })
  confirmations: number;

  constructor() {
    super();
  }
}

export enum Status {
  waiting_confirmations,
  confirmed,
  rejected_no_refund,
  rejected_refund
}

export type PeginStatusWithRelations = PeginStatus;
