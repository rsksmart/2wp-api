import {Model, model, property} from '@loopback/repository';
import {ADDRESS_LIST_MAX_ITEMS} from '../config/limits';
import {BTC_ADDRESS_PATTERN} from '../utils/address-patterns';

@model()
export class AddressList extends Model {

  @property({
    type: 'array',
    itemType: 'string',
    required: true,
    items: {
      type: 'string',
      pattern: BTC_ADDRESS_PATTERN,
    },
    jsonSchema: {
      minItems: 1,
      maxItems: ADDRESS_LIST_MAX_ITEMS,
      uniqueItems: true,
    },
  })
  addressList: string[];

  constructor(data?: Partial<AddressList>) {
    super(data);
  }
}

export type AddressListWithRelations = AddressList;
