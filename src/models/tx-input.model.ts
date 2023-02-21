import {Model, model, property} from '@loopback/repository';

@model()
export class TxInput extends Model {
  @property({
    type: 'array',
    itemType: 'number',
    required: true,
  })
  // eslint-disable-next-line @typescript-eslint/naming-convention
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
  // eslint-disable-next-line @typescript-eslint/naming-convention
  prev_hash: string;

  @property({
    type: 'number',
    required: true,
  })
  // eslint-disable-next-line @typescript-eslint/naming-convention
  prev_index: number;

  @property({
    type: 'string',
  })
  // eslint-disable-next-line @typescript-eslint/naming-convention
  script_type?: string;

  @property({
    type: 'number',
  })
  sequence?: number;

  @property({
    type: 'number',
  })
  amount: number;

  @property({
    type: 'string',
  })
  prevRawTx: string;

  constructor(data?: Partial<TxInput>) {
    super(data);
  }
}

export type TxInputWithRelations = TxInput;
