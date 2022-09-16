import {Model, model, property} from '@loopback/repository';
import {TxInput} from "./tx-input.model";

@model()
export class InputPerFee extends Model {
  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  fast: TxInput[];

  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  average: TxInput[];

  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  slow: TxInput[];


  constructor(data?: Partial<InputPerFee>) {
    super(data);
  }
}

export type InputPerFeeWithRelations = InputPerFee;
