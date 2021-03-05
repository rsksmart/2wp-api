import {Model, model, property} from '@loopback/repository';

@model()
export class FeeAmountData extends Model {
  @property({
    type: 'number',
    required: true,
  })
  slow: number;

  @property({
    type: 'number',
    required: true,
  })
  average: number;

  @property({
    type: 'number',
    required: true,
  })
  fast: number;

  constructor(data?: Partial<FeeAmountData>) {
    super(data);
  }
}

export interface FeeAmountDataRelations {
  // describe navigational properties here
}

export type FeeAmountDataWithRelations = FeeAmountData & FeeAmountDataRelations;
