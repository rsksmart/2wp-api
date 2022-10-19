import {Model, model, property} from '@loopback/repository';

@model()
export class FeeRequestData extends Model {
  @property({
    type: 'string',
    required: true,
  })
    sessionId: string;

  @property({
    type: 'number',
    required: true,
  })
    amount: number;

  @property({
    type: 'string',
    required: true,
  })
    accountType: string;

  constructor(data?: Partial<FeeRequestData>) {
    super(data);
  }
}

export type FeeRequestDataWithRelations = FeeRequestData;
