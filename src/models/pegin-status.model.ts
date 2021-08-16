import {Model, model, property} from '@loopback/repository';
import {PeginStatus as RskPeginStatusEnum} from './rsk/pegin-status-data.model';

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
    type: 'number',
  })
  fees: number;

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

  @property({
    type: 'string',
  })
  btcWTxId: string;

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

  @property({
    type: 'Date',
  })
  createOn: Date;

  @property({
    type: 'object',
  })
  status: RskPeginStatusEnum;

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

  constructor(btc: BtcPeginStatus, rsk?: RskPeginStatus) {
    super();
    this.status = Status.NOT_IN_BTC_YET;
    if (rsk) {
      this.rsk = rsk;
    } else {
      this.rsk = new RskPeginStatus();
    }
    this.btc = btc;
  }

  public setRskPeginStatus(rskData: RskPeginStatus) {
    this.rsk = rskData;
    switch (rskData.status) {
      case RskPeginStatusEnum.REJECTED_REFUND: {
        this.status = Status.REJECTED_REFUND;
        break;
      }
      case RskPeginStatusEnum.REJECTED_NO_REFUND: {
        this.status = Status.REJECTED_NO_REFUND;
        break;
      }
      case RskPeginStatusEnum.LOCKED: {
        this.status = Status.CONFIRMED;
        break;
      }
      default: {
        this.status = Status.NOT_IN_RSK_YET;
      }
    }
  }
}
export enum Status {
  NOT_IN_BTC_YET = 'NOT_IN_BTC_YET',
  WAITING_CONFIRMATIONS = 'WAITING_CONFIRMATIONS',
  NOT_IN_RSK_YET = 'NOT_IN_RSK_YET',
  CONFIRMED = 'CONFIRMED',
  REJECTED_NO_REFUND = 'REJECTED_NO_REFUND',
  REJECTED_REFUND = 'REJECTED_REFUND',
  ERROR_NOT_A_PEGIN = 'ERROR_NOT_A_PEGIN',
  ERROR_BELOW_MIN = 'ERROR_BELOW_MIN',
  ERROR_UNEXPECTED = 'ERROR_UNEXPECTED'
}

export type PeginStatusWithRelations = PeginStatus;
