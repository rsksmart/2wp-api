import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class Utxo extends Model {
  @property({
    type: 'string',
    required: true,
  })
  txid: string;

  @property({
    type: 'number',
    required: true,
  })
  vout: number;

  @property({
    type: 'string',
    required: true,
  })
  amount: string;

  @property({
    type: 'number',
    required: true,
  })
  satoshis: number;

  @property({
    type: 'number',
    required: true,
  })
  height: number;

  @property({
    type: 'number',
    required: true,
  })
  confirmations: number;

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<Utxo>) {
    super(data);
  }
}

export interface UtxoRelations {
  // describe navigational properties here
}

export type UtxoWithRelations = Utxo & UtxoRelations;
