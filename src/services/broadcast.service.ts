import {Provider} from '@loopback/core';
import {MAX_PROVIDER_RESPONSE_BYTES} from '../config/resource-budgets';
import {blockbookUrl} from '../utils/blockbook-url';
import {fetchJsonWithBudget} from '../utils/bounded-http-client';
import {toHttpProviderError} from '../utils/provider-error';

export interface TxStatus {
  result?: string;
  error?: {
    message: string;
  };
}

export interface Broadcast {
  /**
   * Submits a raw transaction to Blockbook.
   *
   * Returns a **one-element array**, which is what the REST connector produced
   * and what `broadcast.controller.ts` destructures.
   */
  broadcast(hexTx: string): Promise<TxStatus[]>;
}

/** Provider operation label used in logs and metric labels. */
const OPERATION = 'blockbook.sendtx';

/**
 * Broadcasts a raw transaction through Blockbook under explicit resource
 * budgets.
 *
 * The *response* here is tiny — a txid or an error message — and this brings it
 * under the same size, time and permit budgets as every other outbound call.
 *
 * What it does **not** address is this endpoint's actual exposure. Blockbook's
 * `/api/v2/sendtx/{hex}` takes the raw transaction in the **URL path**, so a
 * large or hostile `hexTx` becomes a large or hostile request line, and no
 * response budget touches that. A raw Bitcoin transaction can approach 1 MB,
 * which is a ~2 MB URL. What this needs is a length bound and a hex validation
 * before the URL is built, on the inbound side. Tracked separately; naming it
 * here so the gap is not mistaken for coverage.
 *
 * @param hexTx - Raw signed transaction, hex-encoded. URL-encoded here regardless.
 * @returns Blockbook's answer, wrapped in a one-element array for compatibility.
 * @throws {HttpErrors.BadGateway | HttpErrors.GatewayTimeout} If Blockbook breached a budget or failed.
 */
export async function broadcastTransaction(
  hexTx: string,
): Promise<TxStatus[]> {
  const url = blockbookUrl(`/api/v2/sendtx/${encodeURIComponent(hexTx)}`);
  try {
    const body = await fetchJsonWithBudget<TxStatus>({
      url,
      operation: OPERATION,
      maxResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
    });
    return [body];
  } catch (err) {
    throw toHttpProviderError(err, {operation: OPERATION});
  }
}

/**
 * The bound `services.Broadcast` value. Held at module scope so the binding
 * always resolves to the same object and tests can swap the method on it.
 */
const broadcastService: Broadcast = {broadcast: broadcastTransaction};

export class BroadcastProvider implements Provider<Broadcast> {
  value(): Promise<Broadcast> {
    return Promise.resolve(broadcastService);
  }
}
