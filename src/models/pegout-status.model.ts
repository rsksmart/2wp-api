import {Model, model, property} from '@loopback/repository';
import { PegoutStatuses, RejectedPegoutReason } from './rsk/pegout-status-data-model';
import { FlyoverStatuses } from './flyover-status.model';

@model()
export class PegoutStatus extends Model {
  @property({
    type: 'string',
    required: true,
  })
  originatingRskTxHash: string;

  @property({
    type: 'string',
  })
  rskTxHash?: string;

  @property({
    type: 'string',
  })
  rskSenderAddress?: string;

  @property({
    type: 'string',
  })
  btcRecipientAddress?: string;

  @property({
    type: 'number',
    required: true,
  })
  valueRequestedInSatoshis: number;

  @property({
    type: 'number',
  })
  valueInSatoshisToBeReceived?: number;

  @property({
    type: 'number',
  })
  feeInSatoshisToBePaid?: number;

  @property({
    type: 'string',
    required: true,
  })
  status: PegoutStatuses | FlyoverStatuses;

  @property({
    type: 'string',
  })
  btcTxId?: string;

  @property({
    type: 'string',
  })
  reason?: RejectedPegoutReason;


  constructor(data: Partial<PegoutStatus> = {}) {
    super();
    const sanitizedData: Partial<PegoutStatus> = {};
    Object.entries(data).forEach(([key, value]) => {
      const theKey = key as keyof PegoutStatus;
      if (value !== undefined) {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        sanitizedData[theKey] = value;
      }
    });
    Object.assign(this, sanitizedData);
  }

}

