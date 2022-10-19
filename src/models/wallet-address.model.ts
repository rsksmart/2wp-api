import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class WalletAddress extends Model {
  @property({
    type: 'string',
    required: true,
  })
    address: string;

  @property({
    type: 'string',
    required: true,
  })
    serializedPath: string;

  @property({
    type: 'array',
    itemType: 'number',
    required: true,
  })
    path: number[];

  @property({
    type: 'string',
    generated: false,
    required: false,
  })
    addressType?: string;

  constructor(data?: Partial<WalletAddress>) {
    super(data);
  }
}

export type WalletAddressWithRelations = WalletAddress;
