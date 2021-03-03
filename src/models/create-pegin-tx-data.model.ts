import {Model, model, property} from '@loopback/repository';

@model()
export class CreatePeginTxData extends Model {
  @property({
    type: 'number',
    required: true,
  })
  amountToTransferInSatoshi: number;

  @property({
    type: 'string',
    required: true,
  })
  refundAddress: string;

  @property({
    type: 'string',
    required: true,
  })
  recipient: string;

  @property({
    type: 'string',
    required: true,
  })
  sessionId: string;

  @property({
    type: 'string',
    required: true,
  })
  feeLevel: string;

  constructor(data?: Partial<CreatePeginTxData>) {
    super(data);
  }
}

export interface CreatePeginTxDataRelations {
  // describe navigational properties here
}

export type CreatePeginTxDataWithRelations = CreatePeginTxData &
  CreatePeginTxDataRelations;
