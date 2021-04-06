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

  constructor(data?: Partial<AddressBalance>) {
    super(data);
  }
}

export type AddressBalanceWithRelations = AddressBalance;
