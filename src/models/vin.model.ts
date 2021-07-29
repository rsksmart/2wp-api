import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class Vin extends Model {

  @property({
    type: 'string',
  })
  txid: string;

  @property({
    type: 'number',
  })
  vout: number;

  @property({
    type: 'number',
  })
  sequence: number;

  @property({
    type: 'number',
  })
  n?: number;

  @property({
    type: 'string',
    required: true,
  })
  hex: string;

  @property({
    type: 'array',
    itemType: 'string',
  })
  addresses: string[];

  @property({
    type: 'boolean',
  })
  isAddres: boolean;

  @property({
    type: 'number',
  })
  value?: number;

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<Vin>) {
    super(data);
  }
}

export interface VinRelations {
  // describe navigational properties here
}

export type VintWithRelations = Vin & VinRelations;
