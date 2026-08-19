import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {inject} from '@loopback/core';
import {
  ADDRESS_LIST_MAX_ITEMS,
  MAX_ADDRESS_INFO_TXIDS,
  PROVIDER_CONCURRENCY,
} from '../config/resource-budgets';
import {AddressList} from '../models';
import {AddressInfoResponse} from '../models/adddress-info-response.model';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BitcoinService} from '../services';
import {BTC_ADDRESS_PATTERN} from '../utils/address-patterns';
import {validateAddressList} from '../utils/address-list-validation';
import {withConcurrency} from '../utils/concurrency';
import {recordBudgetViolation, ResourceBudgetName} from '../utils/resource-budget';

const ROUTE = 'POST /addresses-info';

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
   * service.
   *
   * The `txids` budget is enforced at the provider: the address datasource pins
   * Blockbook's `pageSize` to `MAX_ADDRESS_INFO_TXIDS` and asks for
   * `details=txids`, so an address with a million transactions never produces a
   * response the application has to materialize and then trim. The truncation
   * below is the backstop for providers that ignore `pageSize`, and it emits a
   * budget-violation signal when it fires.
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
        if (Array.isArray(info.txids) && info.txids.length > MAX_ADDRESS_INFO_TXIDS) {
          recordBudgetViolation({
            resource: ResourceBudgetName.ADDRESS_INFO_TXIDS,
            configuredLimit: MAX_ADDRESS_INFO_TXIDS,
            observedValue: info.txids.length,
            route: ROUTE,
            detail: 'provider ignored the requested page size',
          });
          info.txids = info.txids.slice(0, MAX_ADDRESS_INFO_TXIDS);
        }
        return info;
      },
    );

    return new AddressInfoResponse({addressesInfo});
  }
}
