import {Entity, model, property} from '@loopback/repository';
import {AddressBalance} from './address-balance.model';
import {FeeAmountData} from './fee-amount-data.model';
import {InputPerFee} from "./input-per-fee.model";

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
    type: 'object',
    required: false,
  })
  inputs?: InputPerFee;

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
