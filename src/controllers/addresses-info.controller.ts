import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {AddressList} from '../models';
import {AddressInfoResponse} from '../models/adddress-info-response.model';
import {inject} from '@loopback/core';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BitcoinService} from '../services';

export class AddressesInfoController {
  private bitcoinService:BitcoinService;

  constructor(
    @inject(ServicesBindings.BITCOIN_SERVICE)
    bitcoinService: BitcoinService,
  ) {
    this.bitcoinService = bitcoinService;
  }

  @post('/addresses-info')
  @response(200, {
    description:
      'Returns array of objects with the address information in the input corresponding index',
    content: {'application/json': {schema: getModelSchemaRef(AddressInfoResponse)}},
  })
  getAddressesInfo(
    @requestBody({
    content: {'application/json': {schema: getModelSchemaRef(AddressList)}},
  })
      addressList: AddressList,
    ): Promise<AddressInfoResponse> {
    return new Promise<AddressInfoResponse>((resolve, reject) => {
      const addressInfoPromises = addressList.addressList
        .map((address: string) => this.bitcoinService.getAddressInfo(address));
      Promise.all(addressInfoPromises)
        .then((addressesInfo) => {
          resolve(new AddressInfoResponse({
            addressesInfo,
          }));
        })
        .catch(reject);
    });
  }
}
