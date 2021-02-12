import {Model, model, property} from '@loopback/repository';
import {WalletAddress} from './wallet-address.model';

@model()
export class GetBalance extends Model {
  @property({
    type: 'string',
    required: true,
  })
  sessionId: string;

  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  addressList: WalletAddress[];

  constructor(data?: Partial<GetBalance>) {
    super(data);
  }
}

export interface GetBalanceRelations {
  // describe navigational properties here
}

export type GetBalanceWithRelations = GetBalance & GetBalanceRelations;
