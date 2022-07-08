import {Entity, model, property} from '@loopback/repository';
import {AddressBalance} from './address-balance.model';
import {TxInput} from './tx-input.model';
import {FeeAmountData} from './fee-amount-data.model';

@model({settings: {strict: false}})
export class Session extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    required: true,
  })
  _id: string;

  @property({
    type: 'array',
    itemType: 'object',
    required: false,
  })
  addressList?: AddressBalance[];

  @property({
    type: 'array',
    itemType: 'object',
    required: false,
  })
  inputs?: TxInput[];

  @property({
    type: 'object',
    required: false,
  })
  fees?: FeeAmountData;

  // Define well-known properties here

  // Indexer property to allow additional data
  [prop: string]: any;

  constructor(data?: Partial<Session>) {
    super(data);
  }
}

export type SessionWithRelations = Session;
