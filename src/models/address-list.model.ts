import {Model, model, property} from '@loopback/repository';

@model()
export class AddressList extends Model {

  @property({
    type: 'array',
    itemType: 'string',
    required: true,
  })
    addressList: string[];

  constructor(data?: Partial<AddressList>) {
    super(data);
  }
}

export type AddressListWithRelations = AddressList;
