import {Model, model, property} from '@loopback/repository';

@model()
export class Fee extends Model {
  @property({
    type: 'number',
    required: true,
  })
  amount: number;

  @property({
    type: 'boolean',
    required: true,
  })
  enoughBalance: boolean;
  constructor(data?: Partial<Fee>) {
    super(data);
  }
}

@model()
export class FeeAmountData extends Model {
  @property({
    type: 'Object',
    required: true,
  })
  slow: Fee;

  @property({
    type: 'Object',
    required: true,
  })
  average: Fee;

  @property({
    type: 'Object',
    required: true,
  })
  fast: Fee;

  constructor(data?: Partial<FeeAmountData>) {
    super(data);
  }
}

export type FeeAmountDataWithRelations = FeeAmountData;
