import {Model, model, property} from '@loopback/repository';
import {Vin} from './vin.model';
import {Vout} from './vout.model';

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
  vin?: Vin[];

  @property({
    type: 'array',
    itemType: 'object',
  })
  vout?: Vout[];

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<Tx>) {
    super(data);
  }
}

export interface TxRelations {
  // describe navigational properties here
}

export type TxWithRelations = Tx & TxRelations;
