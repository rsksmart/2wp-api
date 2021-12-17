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

  @property({
    type: 'boolean',
    required: true,
  })
  wereInputsStored: boolean;

  constructor(data?: Partial<FeeAmountData>) {
    super(data);
  }
}

export type FeeAmountDataWithRelations = FeeAmountData;
