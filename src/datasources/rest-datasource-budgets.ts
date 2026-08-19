import {PROVIDER_TIMEOUT_MS} from '../config/resource-budgets';

/**
 * Shared outbound budgets for the LoopBack REST (`loopback-connector-rest`)
 * datasources.
 *
 * What the connector can enforce:
 *
 * - **Request timeout** — set both on the datasource `options` (which become
 *   `request.defaults`) and on every operation template, because the template
 *   value is the one that reaches the underlying HTTP client.
 * - **Explicit JSON expectation** — the `accept`/`content-type` headers make the
 *   connector parse the response as JSON rather than sniffing it.
 *
 * What it cannot enforce:
 *
 * - **Maximum response size** — the connector buffers the whole body before the
 *   application is given a chance to inspect it, so a response-size budget is
 *   impossible at this layer.
 * - **Bounded retries** — the connector has no retry policy to bound.
 *
 * The two high-risk Blockbook endpoints (`/api/v1/utxo/{address}` and
 * `/api/v2/address/{address}`) therefore do *not* go through this connector at
 * all; they use the bounded client in `src/utils/bounded-http-client.ts`, which
 * enforces size, time and retry budgets. See `docs/resource-budgets.md`.
 */
export const REST_DATASOURCE_OPTIONS = {
  headers: {
    accept: 'application/json',
    'content-type': 'application/json',
  },
  timeout: PROVIDER_TIMEOUT_MS,
};

/** Per-operation timeout, in ms, to spread across REST operation templates. */
export const REST_OPERATION_TIMEOUT_MS = PROVIDER_TIMEOUT_MS;
