import {Provider} from '@loopback/core';
import {
  MAX_PROVIDER_RESPONSE_BYTES,
  MAX_UTXOS_PER_ADDRESS,
} from '../config/resource-budgets';
import {blockbookUrl} from '../utils/blockbook-url';
import {fetchJsonWithBudget} from '../utils/bounded-http-client';
import {toHttpProviderError} from '../utils/provider-error';
import {assertWithinBudget, ResourceBudgetName} from '../utils/resource-budget';

export interface Utxo {
  txid: string;
  vout: number;
  amount: string;
  satoshis: number;
  height: number;
  confirmations: number;
}

export interface UtxoProvider {
  utxoProvider(address: string): Promise<Utxo[]>;
}

/** Provider operation label used in logs and metric labels. */
const OPERATION = 'blockbook.utxo';

/**
 * Fetches the UTXO set for a single address from Blockbook under explicit
 * resource budgets.
 *
 * Blockbook's `/api/v1/utxo/{address}` accepts no server-side row limit, so the
 * budget is enforced on this side in two stages that both run *before* the rows
 * are retained by the application:
 *
 * 1. the bounded HTTP client aborts the socket as soon as the response passes
 *    `MAX_PROVIDER_RESPONSE_BYTES`, so an oversized page is never fully
 *    materialized; and
 * 2. the parsed row count is checked against `MAX_UTXOS_PER_ADDRESS` before the
 *    rows are handed back for mapping into models.
 *
 * @param address - BTC address to resolve. Callers must have validated it; it is URL-encoded here regardless.
 * @returns The address's UTXO rows, at most `MAX_UTXOS_PER_ADDRESS` of them.
 * @throws {HttpErrors.PayloadTooLarge} If the address has more UTXOs than the per-address budget allows.
 * @throws {HttpErrors.BadGateway | HttpErrors.GatewayTimeout} If Blockbook breached a size/time budget or failed.
 */
export async function fetchAddressUtxos(address: string): Promise<Utxo[]> {
  const url = blockbookUrl(`/api/v1/utxo/${encodeURIComponent(address)}`);

  let rows: unknown;
  try {
    rows = await fetchJsonWithBudget<unknown>({
      url,
      operation: OPERATION,
      maxResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
    });
  } catch (err) {
    throw toHttpProviderError(err, {operation: OPERATION});
  }

  if (!Array.isArray(rows)) {
    throw toHttpProviderError(
      new Error('Blockbook returned a non-array UTXO payload'),
      {operation: OPERATION},
    );
  }

  assertWithinBudget({
    resource: ResourceBudgetName.UTXOS_PER_ADDRESS,
    configuredLimit: MAX_UTXOS_PER_ADDRESS,
    observedValue: rows.length,
    detail: OPERATION,
  });

  return rows as Utxo[];
}

/**
 * The bound `services.UtxoProvider` value. Held at module scope so the binding
 * always resolves to the same object and tests can swap `utxoProvider` on it.
 */
const utxoProviderService: UtxoProvider = {utxoProvider: fetchAddressUtxos};

export class UtxoProviderProvider implements Provider<UtxoProvider> {
  value(): Promise<UtxoProvider> {
    return Promise.resolve(utxoProviderService);
  }
}
