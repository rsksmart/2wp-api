import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class AccountBalance extends Model {
  @property({
    type: 'number',
    required: true,
  })
  legacy: number;

  @property({
    type: 'number',
    required: true,
  })
  segwit: number;

  @property({
    type: 'number',
    required: true,
  })
  nativeSegwit: number;

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<AccountBalance>) {
    super(data);
  }
}

export interface AccountBalanceRelations {
  // describe navigational properties here
}

export type AccountBalanceWithRelations = AccountBalance & AccountBalanceRelations;
