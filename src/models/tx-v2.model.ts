import {Model, model, property} from '@loopback/repository';
import {Vin} from './vin.model';
import {Vout} from './vout.model';

@model({settings: {strict: false}})
export class TxV2 extends Model {
  @property({
    type: 'string',
  })
    txid: string;

  @property({
    type: 'number',
  })
    version: number;

  @property({
    type: 'number',
  })
    locktime?: number;

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
    blockhash?: string;

  @property({
    type: 'number',
  })
    blockheight: number;

  @property({
    type: 'number',
  })
    confirmations: number;

  @property({
    type: 'number',
  })
    blocktime: number;

  @property({
    type: 'number',
  })
    size: number;

  @property({
    type: 'string',
  })
    valueOutSat: string;

  @property({
    type: 'string',
  })
    valueInSat?: string;

  @property({
    type: 'string',
  })
    feesSat?: string;

  @property({
    type: 'string',
    required: true,
  })
    hex: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<TxV2>) {
    super(data);
  }
}

export interface TxV2Relations {
  // describe navigational properties here
}

export type TxV2WithRelations = TxV2 & TxV2Relations;
