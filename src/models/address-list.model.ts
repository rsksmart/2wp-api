import {Model, model, property} from '@loopback/repository';

@model()
export class AddressList extends Model {

  @property({
    type: 'array',
    itemType: 'string',
    required: true,
    items: {
      type: 'string',
      pattern: '^([13mn][a-km-zA-HJ-NP-Z1-9]{25,34}|2[a-km-zA-HJ-NP-Z1-9]{25,34}|(bc1q|tb1q)[0-9a-z]{39,59}|(bc1p|tb1p)[0-9a-z]{39,59})$',
    },
  })
  addressList: string[];

  constructor(data?: Partial<AddressList>) {
    super(data);
  }
}

export type AddressListWithRelations = AddressList;
