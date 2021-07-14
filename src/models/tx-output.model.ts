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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  address_n?: number[];

  @property({
    type: 'string',
    required: true,
  })
  // eslint-disable-next-line @typescript-eslint/naming-convention
  script_type: string;

  @property({
    type: 'string',
    required: true,
  })
  amount: string;

  @property({
    type: 'string',
  })
  // eslint-disable-next-line @typescript-eslint/naming-convention
  op_return_data?: string;

  [prop: string]: any;

  constructor(data?: Partial<TxOutput>) {
    super(data);
  }
}

export type TxOutputWithRelations = TxOutput;
