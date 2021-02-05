import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class Utxo extends Model {
  @property({
    type: 'string',
    id: true,
    generated: false,
    required: true,
  })
  tx_hash: string;

  @property({
    type: 'string',
  })
  tx_hash_big_endian?: string;

  @property({
    type: 'number',
    required: true,
  })
  tx_output_n: number;

  @property({
    type: 'string',
    required: true,
  })
  script: string;

  @property({
    type: 'number',
    required: true,
  })
  value: number;

  @property({
    type: 'string',
    required: true,
  })
  value_hex: string;

  @property({
    type: 'number',
    required: true,
  })
  confirmations: number;

  @property({
    type: 'number',
    required: true,
  })
  tx_index: number;

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
