import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {inject} from '@loopback/core';
import * as Sentry from "@sentry/node";
import {AddressList} from '../models';
import {AddressInfoResponse} from '../models/adddress-info-response.model';
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
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            addressList: {
              type: 'array',
              items: {
                type: 'string',
                pattern: '^([13mn][a-km-zA-HJ-NP-Z1-9]{25,34}|2[a-km-zA-HJ-NP-Z1-9]{25,34}|(bc1q|tb1q)[0-9a-z]{38,59}|(bc1p|tb1p)[0-9a-z]{39,59})$',
              },
            },
          },
          required: ['addressList'],
          additionalProperties: false,
        },
      }},
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
        .catch((error) => {
          Sentry.captureException(error);
          return reject(error);
        });
    });
  }
}
