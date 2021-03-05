import {Model, model, property} from '@loopback/repository';
import {TxInput} from './tx-input.model';
import {TxOutput} from './tx-output.model';

@model()
export class NormalizedTx extends Model {
  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  inputs: TxInput[];

  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  outputs: TxOutput[];

  constructor(data?: Partial<NormalizedTx>) {
    super(data);
  }
}

export interface NormalizedTxRelations {
  // describe navigational properties here
}

export type NormalizedTxWithRelations = NormalizedTx & NormalizedTxRelations;
