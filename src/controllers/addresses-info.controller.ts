import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {inject} from '@loopback/core';
import {
  ADDRESS_INFO_MAX_TXIDS,
  ADDRESS_LIST_MAX_ITEMS,
  PROVIDER_CONCURRENCY,
} from '../config/limits';
import {AddressList} from '../models';
import {AddressInfoResponse} from '../models/adddress-info-response.model';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BitcoinService} from '../services';
import {BTC_ADDRESS_PATTERN} from '../utils/address-patterns';
import {validateAddressList} from '../utils/address-list-validation';
import {withConcurrency} from '../utils/concurrency';

export class AddressesInfoController {
  private bitcoinService: BitcoinService;

  constructor(
    @inject(ServicesBindings.BITCOIN_SERVICE)
    bitcoinService: BitcoinService,
  ) {
    this.bitcoinService = bitcoinService;
  }

  /**
   * `POST /addresses-info` — resolves each address in `addressList` (in order,
   * with up to `PROVIDER_CONCURRENCY` in flight at once) via the Bitcoin
   * service, truncating each address's `txids` to `ADDRESS_INFO_MAX_TXIDS`.
   *
   * @param addressList - Body containing `addressList`, a deduplicated list of BTC addresses (max `ADDRESS_LIST_MAX_ITEMS`, validated against `BTC_ADDRESS_PATTERN`).
   * @returns The per-address info, in the same order as the input list.
   */
  @post('/addresses-info')
  @response(200, {
    description:
      'Returns array of objects with the address information in the input corresponding index',
    content: {'application/json': {schema: getModelSchemaRef(AddressInfoResponse)}},
  })
  async getAddressesInfo(
    @requestBody({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              addressList: {
                type: 'array',
                items: {type: 'string', pattern: BTC_ADDRESS_PATTERN},
                minItems: 1,
                maxItems: ADDRESS_LIST_MAX_ITEMS,
                uniqueItems: true,
              },
            },
            required: ['addressList'],
            additionalProperties: false,
          },
        },
      },
    })
    addressList: AddressList,
  ): Promise<AddressInfoResponse> {
    validateAddressList(addressList.addressList, {maxItems: ADDRESS_LIST_MAX_ITEMS});

    const addressesInfo = await withConcurrency(
      addressList.addressList,
      PROVIDER_CONCURRENCY,
      async (address: string) => {
        const info = await this.bitcoinService.getAddressInfo(address);
        if (Array.isArray(info.txids) && info.txids.length > ADDRESS_INFO_MAX_TXIDS) {
          info.txids = info.txids.slice(0, ADDRESS_INFO_MAX_TXIDS);
        }
        return info;
      },
    );

    return new AddressInfoResponse({addressesInfo});
  }
}
