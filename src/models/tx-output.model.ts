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

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<TxOutput>) {
    super(data);
  }
}

export interface TxOutputRelations {
  // describe navigational properties here
}

export type TxOutputWithRelations = TxOutput & TxOutputRelations;
