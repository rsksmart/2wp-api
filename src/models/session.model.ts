import {Entity, model, property} from '@loopback/repository';
import {AddressBalance} from './address-balance.model';

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
    type: 'number',
    required: true,
  })
  balance: number;

  @property({
    type: 'array',
    itemType: 'object',
    required: false,
  })
  addressList?: AddressBalance[];

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<Session>) {
    super(data);
  }
}

export interface SessionRelations {
  // describe navigational properties here
}

export type SessionWithRelations = Session & SessionRelations;
