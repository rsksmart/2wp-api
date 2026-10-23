import {Provider} from '@loopback/core';
import {MAX_PROVIDER_RESPONSE_BYTES} from '../config/resource-budgets';
import {blockbookUrl} from '../utils/blockbook-url';
import {fetchJsonWithBudget} from '../utils/bounded-http-client';
import {toHttpProviderError} from '../utils/provider-error';

export interface FeeLevel {
  /**
   * Estimated fee for inclusion within `block` blocks.
   *
   * Returns the response's values flattened, not the response — see
   * {@link flattenFeeResponse}. `estimate-fee.controller.ts` destructures the
   * first element.
   */
  feeProvider(block: number): Promise<string[]>;
}

/** Provider operation label used in logs and metric labels. */
const OPERATION = 'blockbook.estimatefee';

/**
 * Reproduces the JSONPath `$..*` that this endpoint's REST operation declared.
 *
 * `$..*` is a recursive descent: it emits every value at every depth, parents
 * before their children, in document order. `{result, meta: {a, b}}` becomes
 * `[result, meta, a, b]`, and array values are descended into as well.
 *
 * Blockbook only ever answers `{result: '0.00012'}`, so this could have been
 * written as `[body.result]` and would have behaved identically in production.
 * It is written out in full because "identical in production" is not the
 * property that matters when replacing something — the four cases in
 * `blockbook-service-shapes.unit.ts` are this function's specification, and they
 * were captured from the connector before it was removed.
 *
 * @param body - The parsed provider response.
 * @returns Every value in `body`, depth-first, parents first.
 */
export function flattenFeeResponse(body: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (node: unknown): void => {
    if (node === null || typeof node !== 'object') {
      return;
    }
    for (const value of Object.values(node)) {
      out.push(value);
      walk(value);
    }
  };
  walk(body);
  return out;
}

/**
 * Fetches a fee estimate from Blockbook under explicit resource budgets.
 *
 * @param block - Target confirmation depth, in blocks.
 * @returns The response's values, flattened as the REST operation used to.
 * @throws {HttpErrors.BadGateway | HttpErrors.GatewayTimeout} If Blockbook breached a budget or failed.
 */
export async function fetchFeeEstimate(block: number): Promise<string[]> {
  const url = blockbookUrl(`/api/v1/estimatefee/${encodeURIComponent(block)}`);
  try {
    const body = await fetchJsonWithBudget<unknown>({
      url,
      operation: OPERATION,
      maxResponseBytes: MAX_PROVIDER_RESPONSE_BYTES,
    });
    return flattenFeeResponse(body) as string[];
  } catch (err) {
    throw toHttpProviderError(err, {operation: OPERATION});
  }
}

/**
 * The bound `services.FeeLevel` value. Held at module scope so the binding
 * always resolves to the same object and tests can swap the method on it.
 */
const feeLevelService: FeeLevel = {feeProvider: fetchFeeEstimate};

export class FeeLevelProvider implements Provider<FeeLevel> {
  value(): Promise<FeeLevel> {
    return Promise.resolve(feeLevelService);
  }
}
