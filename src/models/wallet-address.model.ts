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

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<WalletAddress>) {
    super(data);
  }
}

export interface WalletAddressRelations {
  // describe navigational properties here
}

export type WalletAddressWithRelations = WalletAddress & WalletAddressRelations;
