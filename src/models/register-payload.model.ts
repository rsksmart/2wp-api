import {Model, model, property} from '@loopback/repository';

@model()
export class RegisterPayload extends Model {
  @property({
    type: 'string',
    required: true,
  })
  txHash: string;

  @property({
    type: 'string',
    required: true,
  })
  type: string;

  @property({
    type: 'number',
    required: true,
  })
  value: number;

  @property({
    type: 'string',
    required: true,
  })
  wallet: string;

  @property({
    type: 'number',
  })
  fee?: number;

  constructor(data?: Partial<RegisterPayload>) {
    super(data);
  }
}
