import {inject} from '@loopback/core';
import {HttpErrors, getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {getLogger, Logger} from '../utils/logger';
import {
  ADDRESS_LIST_MAX_ITEMS,
  PROVIDER_CONCURRENCY,
  UTXO_RESPONSE_MAX_ROWS,
} from '../config/limits';
import {ServicesBindings} from '../dependency-injection-bindings';
import {AddressList, Utxo} from '../models';
import {UtxoResponse} from '../models/utxo-response.model';
import {UtxoProvider} from '../services';
import {BTC_ADDRESS_PATTERN} from '../utils/address-patterns';
import {validateAddressList} from '../utils/address-list-validation';
import {withConcurrency} from '../utils/concurrency';

export class UtxoController {
  logger: Logger;

  constructor(
    @inject(ServicesBindings.UTXO_PROVIDER_SERVICE)
    protected utxoProviderService: UtxoProvider,
  ) {
    this.logger = getLogger('utxo-controller');
  }

  /**
   * `POST /utxo` — resolves the unspent transaction outputs for each address in
   * `addressList` (in order, with up to `PROVIDER_CONCURRENCY` in flight at once).
   *
   * @param addressList - Body containing `addressList`, a deduplicated list of BTC addresses (max `ADDRESS_LIST_MAX_ITEMS`, validated against `BTC_ADDRESS_PATTERN`).
   * @returns The flattened list of UTXOs across all addresses.
   * @throws {HttpErrors.PayloadTooLarge} If the combined UTXO count exceeds `UTXO_RESPONSE_MAX_ROWS`.
   */
  @post('/utxo')
  @response(200, {
    description:
      'Returns array of unspent transaction outputs from a list of addresses',
    content: {'application/json': {schema: getModelSchemaRef(UtxoResponse)}},
  })
  @response(413, {
    description: `UTXO response exceeds the maximum of ${UTXO_RESPONSE_MAX_ROWS} rows`,
  })
  async getUtxos(
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
  ): Promise<UtxoResponse> {
    validateAddressList(addressList.addressList, {maxItems: ADDRESS_LIST_MAX_ITEMS});

    const utxosWithAddress = await withConcurrency(
      addressList.addressList,
      PROVIDER_CONCURRENCY,
      async (address: string) => {
        const utxos = await this.utxoProviderService.utxoProvider(address);
        return utxos.map(utxo => new Utxo({address, ...utxo}));
      },
    );

    const flat = utxosWithAddress.flat();
    if (flat.length > UTXO_RESPONSE_MAX_ROWS) {
      throw new HttpErrors.PayloadTooLarge(
        `UTXO response exceeds maximum of ${UTXO_RESPONSE_MAX_ROWS} rows`,
      );
    }

    this.logger.debug({method: 'getUtxos', count: flat.length}, 'Got utxos!');
    return new UtxoResponse({data: flat});
  }
}
