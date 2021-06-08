import {Model, model, property} from '@loopback/repository';

@model()
export class BtcPeginStatus extends Model {
  @property({
    type: 'string',
  })
  txId: string;

  @property({
    type: 'date',
    defaultFn: 'now'
  })
  creationDate: Date;

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

@model()
export class PeginStatus extends Model {
  @property({
    type: 'object',
    required: true,
  })
  btc: BtcPeginStatus;

  @property({
    type: 'object',
  })
  rsk: RskPeginStatus;

  @property({
    type: 'object',
  })
  status: Status;

  constructor(btc: BtcPeginStatus, status: Status, rsk?: RskPeginStatus) {
    super();
    this.status = status;
    if (rsk) {
      this.rsk = rsk;
    } else {
      this.rsk = new RskPeginStatus();
    }
    this.btc = btc;
  }
}

export enum Status {
  not_in_btc_yet,
  waiting_confirmations,
  confirmed,
  rejected_no_refund,
  rejected_refund
}

export type PeginStatusWithRelations = PeginStatus;
