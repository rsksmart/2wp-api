import {inject} from '@loopback/core';
import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {getLogger, Logger} from '../utils/logger';
import {
  ADDRESS_LIST_MAX_ITEMS,
  MAX_UTXOS_PER_ADDRESS,
  PROVIDER_CONCURRENCY,
  UTXO_RESPONSE_MAX_ROWS,
} from '../config/resource-budgets';
import {ServicesBindings} from '../dependency-injection-bindings';
import {AddressList, Utxo} from '../models';
import {UtxoResponse} from '../models/utxo-response.model';
import {UtxoProvider} from '../services';
import {BTC_ADDRESS_PATTERN} from '../utils/address-patterns';
import {validateAddressList} from '../utils/address-list-validation';
import {reduceWithConcurrency} from '../utils/concurrency';
import {budgetExceededError, ResourceBudgetName} from '../utils/resource-budget';

const ROUTE = 'POST /utxo';

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
   * The row budget is enforced *while* results arrive rather than after the
   * whole result set has been fetched and flattened: the provider caps each
   * address at `MAX_UTXOS_PER_ADDRESS` rows (and aborts an oversized Blockbook
   * response mid-stream), and each settled batch is folded into the response
   * immediately, so passing `UTXO_RESPONSE_MAX_ROWS` rejects before the next
   * batch of provider requests is issued. Peak retained rows are therefore
   * bounded by `UTXO_RESPONSE_MAX_ROWS + (PROVIDER_CONCURRENCY x
   * MAX_UTXOS_PER_ADDRESS)` regardless of how much the provider offers.
   *
   * @param addressList - Body containing `addressList`, a deduplicated list of BTC addresses (max `ADDRESS_LIST_MAX_ITEMS`, validated against `BTC_ADDRESS_PATTERN`).
   * @returns The flattened list of UTXOs across all addresses.
   * @throws {HttpErrors.PayloadTooLarge} If the combined UTXO count exceeds `UTXO_RESPONSE_MAX_ROWS`, or a single address exceeds `MAX_UTXOS_PER_ADDRESS`.
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

    const collected = await reduceWithConcurrency<string, Utxo[], Utxo[]>(
      addressList.addressList,
      PROVIDER_CONCURRENCY,
      async (address: string) => {
        const utxos = await this.utxoProviderService.utxoProvider(address);
        // Defence in depth: the provider already enforces this budget, but a
        // stubbed or future provider must not be able to hand back an unbounded
        // page that we then map into models.
        if (utxos.length > MAX_UTXOS_PER_ADDRESS) {
          throw budgetExceededError({
            resource: ResourceBudgetName.UTXOS_PER_ADDRESS,
            configuredLimit: MAX_UTXOS_PER_ADDRESS,
            observedValue: utxos.length,
            route: ROUTE,
          });
        }
        return utxos.map(utxo => new Utxo({address, ...utxo}));
      },
      (acc, rows) => {
        if (acc.length + rows.length > UTXO_RESPONSE_MAX_ROWS) {
          throw budgetExceededError({
            resource: ResourceBudgetName.UTXO_RESPONSE_ROWS,
            configuredLimit: UTXO_RESPONSE_MAX_ROWS,
            observedValue: acc.length + rows.length,
            route: ROUTE,
          });
        }
        // Appended one by one: `push(...rows)` would spread an operator-tunable
        // number of arguments onto the stack.
        for (const row of rows) {
          acc.push(row);
        }
        return acc;
      },
      [],
    );

    this.logger.debug({method: 'getUtxos', count: collected.length}, 'Got utxos!');
    return new UtxoResponse({data: collected});
  }
}
