import {Model, model, property} from '@loopback/repository';
import {BitcoinAddress} from './bitcoin-address.model';

@model({settings: {strict: false}})
export class AddressInfoResponse extends Model {

  @property({
    type: 'array',
    itemType: 'object',
    default: [],
  })
  addressesInfo?: BitcoinAddress[];

  constructor(data?: Partial<AddressInfoResponse>) {
    super(data);
  }
}
