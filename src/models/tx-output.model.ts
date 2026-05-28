import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class TxOutput extends Model {
  @property({
    type: 'string',
  })
  address?: string;

  @property({
    type: 'array',
    itemType: 'number',
  })
  address_n?: number[];

  @property({
    type: 'string',
    required: true,
  })
  script_type: string;

  @property({
    type: 'string',
    required: true,
  })
  amount: string;

  @property({
    type: 'string',
  })
  op_return_data?: string;

  [prop: string]: any;

  constructor(data?: Partial<TxOutput>) {
    super(data);
  }
}

export type TxOutputWithRelations = TxOutput;
