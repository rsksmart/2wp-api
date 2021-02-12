import {Model, model, property} from '@loopback/repository';
import {Utxo} from './utxo.model';

@model({settings: {strict: false}})
export class AddressBalance extends Model {
  @property({
    type: 'string',
    id: true,
    generated: false,
    required: true,
  })
  address: string;

  @property({
    type: 'array',
    itemType: 'object',
    default: [],
  })
  utxoList?: Utxo[];

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<AddressBalance>) {
    super(data);
  }
}

export interface AddressBalanceRelations {
  // describe navigational properties here
}

export type AddressBalanceWithRelations = AddressBalance &
  AddressBalanceRelations;
