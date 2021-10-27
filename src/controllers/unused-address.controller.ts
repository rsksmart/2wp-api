import {inject} from '@loopback/core';
import {getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {AddressList} from '../models/address-list.model';
import {UnusedAddressService} from '../services/unused-address.service';

export class UnusedAddressController {
  logger: Logger;

  constructor(
    @inject(ServicesBindings.UNUSED_ADDRESS_SERVICE)
    protected unusedAddressService: UnusedAddressService
  ) {
    this.logger = getLogger('unused-address-controller');
  }

  @post('/unusedAddreses', {
    responses: {
      '200': {
        description: 'verify unused addresses',
        content: {
          'application/json': {
            schema: getModelSchemaRef(Boolean, {includeRelations: true}),
          },
        },
      },
    },
  })
  async isUnusedAddresses(
    @requestBody({schema: getModelSchemaRef(AddressList)})
    addressList: AddressList,
  ): Promise<Boolean> {
    return this.unusedAddressService.isUnusedAddresses(addressList.addressList);
  }
}
