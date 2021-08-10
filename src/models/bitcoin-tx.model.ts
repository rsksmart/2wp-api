import {Model, model, property} from '@loopback/repository';
import {Vin} from './vin.model';
import {Vout} from './vout.model';


@model({settings: {strict: false}})
export class BitcoinTx extends Model {

  @property({
    type: 'string',
  })
  txId: string;

  @property({
    type: 'number',
  })
  version: number;

  @property({
    type: 'array',
    itemType: 'object',
  })
  vin: Vin[];

  @property({
    type: 'array',
    itemType: 'object',
  })
  vout: Vout[];

  @property({
    type: 'string',
  })
  blockHash: string;

  @property({
    type: 'number',
  })
  blockHeight: number;

  @property({
    type: 'number',
  })
  confirmations: number;

  @property({
    type: 'number',
  })
  time: number;

  @property({
    type: 'number',
  })
  blockTime: number;

  @property({
    type: 'string',
  })
  valueOut?: string;

  @property({
    type: 'string',
  })
  valueIn?: string;

  @property({
    type: 'number',
  })
  fees?: number;

  @property({
    type: 'string',
    required: true,
  })
  hex: string;

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor() {
    super();
  }
}

export interface BitcoinTxRelations {
  // describe navigational properties here
}

export type BitcoinTxWithRelations = BitcoinTx & BitcoinTxRelations;
