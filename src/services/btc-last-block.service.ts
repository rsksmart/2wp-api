import {Provider} from '@loopback/core';
import {MAX_PROVIDER_RESPONSE_BYTES} from '../config/resource-budgets';
import {blockbookUrl} from '../utils/blockbook-url';
import {fetchJsonWithBudget} from '../utils/bounded-http-client';
import {toHttpProviderError} from '../utils/provider-error';

export interface LastBlockInfoResponse {
  blockbook: BlockBook;
  backend: BackEnd;
}

export interface BlockBook {
    coin: string,
    host: string,
    version: string,
    syncMode: boolean,
    inSync: boolean,
    initialSync: boolean,
    bestHeight: number,
}

export interface BackEnd {
    chain: string,
    blocks: number,
    bestBlockHash: string,
}

export interface LastBlockService {
  /**
   * Blockbook's sync status.
   *
   * Returns a **one-element array**, which is what the REST connector produced
   * before this went through the bounded client and what `bitcoin.service.ts`
   * reads as `lbir[0]`. The declared type used to say `Promise<LastBlockInfoResponse>`
   * and was simply wrong; the caller only worked because it cast to `any`.
   * `blockbook-service-shapes.unit.ts` pins the real shape.
   */
  lastBlockProvider(): Promise<LastBlockInfoResponse[]>;
}

/** Provider operation label used in logs and metric labels. */
const OPERATION = 'blockbook.blocks';

/**
 * Fetches Blockbook's sync status under explicit resource budgets.
 *
 * A few hundred bytes in practice, so the general provider budget is the right
 * one — but it goes through the bounded client all the same. An unbounded read is
 * unbounded regardless of what the endpoint *usually* returns, and this way there
 * is one place to look when an outbound call misbehaves rather than two.
 *
 * @returns The sync status, wrapped in a one-element array for compatibility.
 * @throws {HttpErrors.BadGateway | HttpErrors.GatewayTimeout} If Blockbook breached a budget or failed.
 */
export async function fetchLastBlock(): Promise<LastBlockInfoResponse[]> {
  const url = blockbookUrl('/api/blocks');
  try {
    const body = await fetchJsonWithBudget<LastBlockInfoResponse>({
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
 * The bound `services.LastBlockService` value. Held at module scope so the
 * binding always resolves to the same object and tests can swap the method on it.
 */
const lastBlockService: LastBlockService = {lastBlockProvider: fetchLastBlock};

export class LastBlockServiceProvider implements Provider<LastBlockService> {
  value(): Promise<LastBlockService> {
    return Promise.resolve(lastBlockService);
  }
}
