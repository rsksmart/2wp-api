import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class BitcoinAddress extends Model {

  @property({
    type: 'number',
  })
    page: number;

  @property({
    type: 'number',
  })
    totalPages: number;

  @property({
    type: 'number',
  })
    itemsOnPage: number;

  @property({
    type: 'string',
  })
    address: string;

  @property({
    type: 'string',
  })
    balance: string;

  @property({
    type: 'string',
  })
    totalReceived: string;

  @property({
    type: 'string',
  })
    totalSent: string;

  @property({
    type: 'string',
  })
    unconfirmedBalance: string;

  @property({
    type: 'string',
  })
    unconfirmedTxs: string;

  @property({
    type: 'number',
  })
    txs: number;

  @property({
    type: 'array',
    itemType: 'string',
  })
    txids: string[];

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor() {
    super();
  }
}

export interface BitcoinAddressRelations {
  // describe navigational properties here
}

export type BitcoinAddressWithRelations = BitcoinAddress & BitcoinAddressRelations;
