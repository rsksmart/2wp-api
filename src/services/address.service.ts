import {Provider} from '@loopback/core';
import {
  MAX_ADDRESS_INFO_TXIDS,
  MAX_PROVIDER_RESPONSE_BYTES,
} from '../config/resource-budgets';
import {blockbookUrl} from '../utils/blockbook-url';
import {fetchJsonWithBudget} from '../utils/bounded-http-client';
import {toHttpProviderError} from '../utils/provider-error';

export interface Address {
  content: string;
}

export interface AddressService {
  addressProvider(address: string): Promise<Address>
}

/** Provider operation label used in logs and metric labels. */
const OPERATION = 'blockbook.address';

/**
 * Fetches address information from Blockbook under explicit resource budgets.
 *
 * Unlike the UTXO endpoint, Blockbook's `/api/v2/address/{address}` *does*
 * accept a server-side limit, so the preferred protection applies: `pageSize` is
 * pinned to `MAX_ADDRESS_INFO_TXIDS` and `details=txids` keeps full transaction
 * bodies out of the response entirely. The provider therefore never sends more
 * `txids` than the budget allows, instead of the application materializing the
 * whole history and truncating it afterwards. The bounded HTTP client enforces
 * the byte and time budgets on top of that.
 *
 * @param address - BTC address to resolve. Callers must have validated it; it is URL-encoded here regardless.
 * @returns A single-element array holding the Blockbook address payload. The array wrapper preserves the shape the LoopBack REST connector produced for `responsePath: '$'`, which consumers index with `[0]`.
 * @throws {HttpErrors.BadGateway | HttpErrors.GatewayTimeout} If Blockbook breached a size/time budget or failed.
 */
export async function fetchAddressInfo(address: string): Promise<Address> {
  const url = blockbookUrl(`/api/v2/address/${encodeURIComponent(address)}`, {
    details: 'txids',
    pageSize: MAX_ADDRESS_INFO_TXIDS,
    page: 1,
  });

  try {
    const payload = await fetchJsonWithBudget<unknown>({
      url,
      operation: OPERATION,
      maxResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
    });
    return [payload] as unknown as Address;
  } catch (err) {
    throw toHttpProviderError(err, {operation: OPERATION, address});
  }
}

/**
 * The bound `services.AddressService` value. Held at module scope so the binding
 * always resolves to the same object and tests can swap `addressProvider` on it.
 */
const addressService: AddressService = {addressProvider: fetchAddressInfo};

export class AddressServiceProvider implements Provider<AddressService> {
  value(): Promise<AddressService> {
    return Promise.resolve(addressService);
  }
}
