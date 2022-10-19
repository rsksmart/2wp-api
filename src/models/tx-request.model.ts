import {Model, model, property} from '@loopback/repository';

@model()
export class TxRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
    txId: string;

  constructor(data?: Partial<TxRequest>) {
    super(data);
  }
}

export interface TxRequestRelations {
  // describe navigational properties here
}

export type TxRequestWithRelations = TxRequest & TxRequestRelations;
