import {Provider} from '@loopback/core';
import {MAX_TX_PROVIDER_RESPONSE_BYTES} from '../config/resource-budgets';
import {blockbookUrl} from '../utils/blockbook-url';
import {fetchJsonWithBudget} from '../utils/bounded-http-client';
import {toHttpProviderError} from '../utils/provider-error';
import {txProviderPermits} from '../utils/provider-permits';

export interface Txv2 {
  content: string;
}

export interface TxV2Service {
  /**
   * Blockbook's v2 view of a transaction.
   *
   * Returns a **one-element array**. The declared type used to say
   * `Promise<Txv2>` and was wrong: `responsePath: '$'` is a JSONPath expression
   * and JSONPath always yields a list of matches. `bitcoin.service.ts` only
   * worked because it cast to `any` and read `tx[0]`, and the next person to
   * tidy that cast away would have broken production.
   * `blockbook-service-shapes.unit.ts` pins the real shape.
   */
  txV2Provider(txId: string): Promise<Txv2[]>;
}

/** Provider operation label used in logs and metric labels. */
const OPERATION = 'blockbook.tx.v2';

/**
 * Fetches a transaction from Blockbook's v2 API under explicit resource budgets.
 *
 * Same exposure as {@link fetchTx} and the same two budgets: the v2 payload also
 * carries the raw transaction `hex`, and this is the path behind
 * `GET /tx-status`, which is likewise unauthenticated. See `fetchTx` for why the
 * budget and the pool are both dedicated.
 *
 * @param txId - Transaction id to look up. URL-encoded here regardless.
 * @returns The transaction, wrapped in a one-element array for compatibility.
 * @throws {HttpErrors.BadGateway | HttpErrors.GatewayTimeout} If Blockbook breached a budget or failed.
 * @throws {PermitRejectedError} If the transaction pool and its queue are both full.
 */
export async function fetchTxV2(txId: string): Promise<Txv2[]> {
  const url = blockbookUrl(`/api/v2/tx/${encodeURIComponent(txId)}`);
  try {
    const body = await fetchJsonWithBudget<Txv2>({
      url,
      operation: OPERATION,
      maxResponseBytes: MAX_TX_PROVIDER_RESPONSE_BYTES,
      permits: txProviderPermits,
    });
    return [body];
  } catch (err) {
    throw toHttpProviderError(err, {operation: OPERATION, txId});
  }
}

/**
 * The bound `services.TxV2Service` value. Held at module scope so the binding
 * always resolves to the same object and tests can swap the method on it.
 */
const txV2Service: TxV2Service = {txV2Provider: fetchTxV2};

export class TxV2ServiceProvider implements Provider<TxV2Service> {
  value(): Promise<TxV2Service> {
    return Promise.resolve(txV2Service);
  }
}
