import {Model, model, property} from '@loopback/repository';

@model()
export class NormalizedTx extends Model {
  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  inputs: object[];

  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  outputs: object[];

  @property({
    type: 'number',
    required: true,
  })
  size: number;

  constructor(data?: Partial<NormalizedTx>) {
    super(data);
  }
}

export interface NormalizedTxRelations {
  // describe navigational properties here
}

export type NormalizedTxWithRelations = NormalizedTx & NormalizedTxRelations;
