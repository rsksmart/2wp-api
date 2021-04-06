import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class Utxo extends Model {
  @property({
    type: 'string',
  })
  address?: string;

  @property({
    type: 'string',
    required: true,
  })
  txid: string;

  @property({
    type: 'number',
    required: true,
  })
  vout: number;

  @property({
    type: 'string',
    required: true,
  })
  amount: string;

  @property({
    type: 'number',
    required: true,
  })
  satoshis: number;

  @property({
    type: 'number',
    required: true,
  })
  height: number;

  @property({
    type: 'number',
    required: true,
  })
  confirmations: number;

  constructor(data?: Partial<Utxo>) {
    super(data);
  }
}

export type UtxoWithRelations = Utxo;
