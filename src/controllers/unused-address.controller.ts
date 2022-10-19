/* eslint-disable @typescript-eslint/naming-convention */
import {inject} from '@loopback/core';
import {getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {AddressList, UnusedAddressResponse} from '../models';
import {UnusedAddressService} from '../services';

export class UnusedAddressController {
  logger: Logger;

  constructor(
    @inject(ServicesBindings.UNUSED_ADDRESS_SERVICE)
    protected unusedAddressService: UnusedAddressService,
  ) {
    this.logger = getLogger('unused-address-controller');
  }

  @post('/unusedAddreses', {
    responses: {
      '200': {
        description: 'verify unused addresses',
        content: {
          'application/json': {
            schema: getModelSchemaRef(UnusedAddressResponse),
          },
        },
      },
    },
  })
  async isUnusedAddresses(
    @requestBody({schema: getModelSchemaRef(AddressList)})
      addressList: AddressList,
  ): Promise<UnusedAddressResponse> {
    this.logger.trace(`[isUnusedAddresses] Starting with addressList ${addressList.addressList}`);
    return this.unusedAddressService.isUnusedAddresses(addressList.addressList);
  }
}
