import {Model, model, property} from '@loopback/repository';
import {AddressUsedStatus} from './address-used-status.model';

@model()
export class UnusedAddressResponse extends Model {
  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  data: AddressUsedStatus[];


  constructor(data?: Partial<UnusedAddressResponse>) {
    super(data);
  }
}

export interface UnusedAddressResponseRelations {
  // describe navigational properties here
}

export type UnusedAddressResponseWithRelations = UnusedAddressResponse & UnusedAddressResponseRelations;
