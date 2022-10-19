/* eslint-disable @typescript-eslint/naming-convention */
import {Model, model, property} from '@loopback/repository';

@model()
export class TxInput extends Model {
  @property({
    type: 'array',
    itemType: 'number',
    required: true,
  })
    address_n: number[];

  @property({
    type: 'string',
    required: true,
  })
    address: string;

  @property({
    type: 'string',
    required: true,
  })
    prev_hash: string;

  @property({
    type: 'number',
    required: true,
  })
    prev_index: number;

  @property({
    type: 'string',
  })
    script_type?: string;

  @property({
    type: 'number',
  })
    sequence?: number;

  @property({
    type: 'number',
  })
    amount: number;

  constructor(data?: Partial<TxInput>) {
    super(data);
  }
}

export type TxInputWithRelations = TxInput;
