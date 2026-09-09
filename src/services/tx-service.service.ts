import {Provider} from '@loopback/core';
import {MAX_TX_PROVIDER_RESPONSE_BYTES} from '../config/resource-budgets';
import {blockbookUrl} from '../utils/blockbook-url';
import {fetchJsonWithBudget} from '../utils/bounded-http-client';
import {toHttpProviderError} from '../utils/provider-error';
import {txProviderPermits} from '../utils/provider-permits';

export interface Tx {
  txid: string;
  version: number;
  vin: object[];
  vout: object[];
  blockhash: string;
  blockheight: number;
  confirmations: number;
  time: number;
  blocktime: number;
  valueOut: string;
  valueIn: string;
  fees: string;
  hex: string;
}

export interface TxService {
  /**
   * Blockbook's v1 view of a transaction.
   *
   * Returns a **one-element array**, which is what the REST connector produced
   * and what `tx.controller.ts` destructures with `.then(([tx]) => ...)`.
   * `blockbook-service-shapes.unit.ts` pins it.
   */
  txProvider(txId: string): Promise<Tx[]>;
}

/** Provider operation label used in logs and metric labels. */
const OPERATION = 'blockbook.tx';

/**
 * Fetches a transaction from Blockbook under explicit resource budgets.
 *
 * This is the call the budget is about. `hex` is the raw Bitcoin transaction
 * and is part of the public contract of `GET /tx`, so responses here are
 * measured in megabytes where every other Blockbook call is measured in
 * kilobytes. Through the REST connector an oversized one was buffered whole,
 * raised `Cannot create a string longer than 0x1fffffe8 characters` from
 * `postman-request`, and — because that error is not in the allowlist in
 * `index.ts` — reached `shutdown()` and killed the process. One unauthenticated
 * request.
 *
 * Two budgets, and they only work together:
 *
 * - `MAX_TX_PROVIDER_RESPONSE_BYTES` rather than the general provider budget,
 *   because 1.5 MiB would refuse legitimate lookups — a failure that shows up as
 *   a 502 on large transactions and nothing else.
 * - `txProviderPermits` rather than the general pool, because a budget this size
 *   on a 50-slot pool multiplies into more heap than the process has. Bounding
 *   one response is not bounding the process; the product is.
 *
 * @param txId - Transaction id to look up. URL-encoded here regardless.
 * @returns The transaction, wrapped in a one-element array for compatibility.
 * @throws {HttpErrors.BadGateway | HttpErrors.GatewayTimeout} If Blockbook breached a budget or failed.
 * @throws {PermitRejectedError} If the transaction pool and its queue are both full.
 */
export async function fetchTx(txId: string): Promise<Tx[]> {
  const url = blockbookUrl(`/api/v1/tx/${encodeURIComponent(txId)}`);
  try {
    const body = await fetchJsonWithBudget<Tx>({
      url,
      operation: OPERATION,
      maxResponseBytes: MAX_TX_PROVIDER_RESPONSE_BYTES,
      permits: txProviderPermits,
    });
    return [body];
  } catch (err) {
    throw toHttpProviderError(err, {operation: OPERATION});
  }
}

/**
 * The bound `services.TxService` value. Held at module scope so the binding
 * always resolves to the same object and tests can swap the method on it.
 */
const txService: TxService = {txProvider: fetchTx};

export class TxServiceProvider implements Provider<TxService> {
  value(): Promise<TxService> {
    return Promise.resolve(txService);
  }
}
