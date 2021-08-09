import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class Vout extends Model {
  @property({
    type: 'number',
  })
  valueSat?: number;

  @property({
    type: 'number',
  })
  n: number;

  @property({
    type: 'boolean',
  })
  spent?: boolean;

  @property({
    type: 'string',
  })
  spentTxID: string;

  @property({
    type: 'number',
  })
  spentIndex?: number;

  @property({
    type: 'number',
  })
  spentHeight?: number;

  @property({
    type: 'string',
    required: true,
  })
  hex?: string;

  @property({
    type: 'string',
    required: true,
  })
  asm?: string;

  @property({
    type: 'string',
  })
  addrDesc?: string;

  @property({
    type: 'array',
    itemType: 'string',
  })
  addresses: string[];

  @property({
    type: 'boolean',
  })
  isAddress: boolean;

  @property({
    type: 'string',
  })
  type?: string;

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<Vout>) {
    super(data);
  }
}

export interface VoutRelations {
  // describe navigational properties here
}

export type VoutWithRelations = Vout & VoutRelations;
