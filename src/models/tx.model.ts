import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class Tx extends Model {
  @property({
    type: 'string',
  })
  txid?: string;

  @property({
    type: 'number',
  })
  version?: number;

  @property({
    type: 'array',
    itemType: 'object',
  })
  vin?: object[];

  @property({
    type: 'array',
    itemType: 'object',
  })
  vout?: object[];

  @property({
    type: 'string',
  })
  blockhash?: string;

  @property({
    type: 'number',
  })
  blockheight?: number;

  @property({
    type: 'number',
  })
  confirmations?: number;

  @property({
    type: 'number',
  })
  time?: number;

  @property({
    type: 'number',
  })
  blocktime?: number;

  @property({
    type: 'string',
  })
  valueOut?: string;

  @property({
    type: 'string',
  })
  valueIn?: string;

  @property({
    type: 'string',
  })
  fees?: string;

  @property({
    type: 'string',
    required: true,
  })
  hex: string;

  // Define well-known properties here
  // Indexer property to allow additional data
  [prop: string]: any;

  constructor(data?: Partial<Tx>) {
    super(data);
  }
}

export interface TxRelations {
  // describe navigational properties here
}

export type TxWithRelations = Tx & TxRelations;
