/**
 * Central resource budgets for the PowPeg API.
 *
 * Every value in here caps how much memory, parsing, serialization or
 * downstream provider work a single request (or a single provider response) is
 * allowed to cause. The budgets are deliberately kept in one module so the
 * whole resource-protection policy can be reviewed — and tuned per
 * environment — in a single place instead of being spread across the code
 * paths that enforce them.
 *
 * All budgets are environment-variable driven and fall back to the safe
 * defaults in {@link RESOURCE_BUDGET_DEFAULTS}. Enforcement helpers live in
 * `src/utils/resource-budget.ts`.
 */

/** Shape of an environment-variable source (`process.env` in production). */
export type EnvSource = Record<string, string | undefined>;

/** Every configurable resource budget, resolved to a concrete number. */
export interface ResourceBudgets {
  /** Hard cap on the inbound HTTP request body, in bytes. */
  MAX_REQUEST_BODY_BYTES: number;
  /** Hard cap on a single outbound provider response, in bytes. */
  MAX_PROVIDER_RESPONSE_BYTES: number;
  /** Hard cap on the UTXO rows retained for one address. */
  MAX_UTXOS_PER_ADDRESS: number;
  /** Hard cap on the UTXO rows retained for one `/utxo` request. */
  UTXO_RESPONSE_MAX_ROWS: number;
  /** Hard cap on the `txids` retained per address in `/addresses-info`. */
  MAX_ADDRESS_INFO_TXIDS: number;
  /** Outbound provider request timeout, in milliseconds. */
  PROVIDER_TIMEOUT_MS: number;
  /** Extra attempts (beyond the first) for a failed provider request. */
  PROVIDER_MAX_RETRIES: number;
  /** Base backoff between provider retries, in milliseconds. */
  PROVIDER_RETRY_BASE_DELAY_MS: number;
  /** Hard cap on the number of addresses accepted in one request. */
  ADDRESS_LIST_MAX_ITEMS: number;
  /** Maximum provider requests in flight for a single API request. */
  PROVIDER_CONCURRENCY: number;
  /** Hard cap on a serialized error response body, in bytes. */
  MAX_ERROR_RESPONSE_BYTES: number;
  /** Hard cap on the validation details returned to the client. */
  MAX_VALIDATION_ERROR_DETAILS: number;
  /** Hard cap on response bytes buffered for one connection, in bytes. */
  MAX_CONNECTION_BUFFERED_BYTES: number;
  /** Wall-clock deadline for handling one inbound request, in milliseconds. */
  MAX_REQUEST_DURATION_MS: number;
  /**
   * How long cooperative unwinding is given after a request's deadline trips,
   * before the response is written for it.
   */
  REQUEST_DEADLINE_GRACE_MS: number;
  /** Length of the fixed rate-limit window, in milliseconds. */
  RATE_LIMIT_WINDOW_MS: number;
  /** Requests one client may make per window on ordinary routes. */
  RATE_LIMIT_MAX_REQUESTS: number;
  /** Requests one client may make per window on the fan-out POSTs. */
  RATE_LIMIT_MAX_FANOUT_REQUESTS: number;
  /** Hard cap on how many clients the limiter will track at once. */
  RATE_LIMIT_MAX_TRACKED_CLIENTS: number;
  /** Hard cap on Blockbook operations in flight across the whole process. */
  BLOCKBOOK_MAX_IN_FLIGHT: number;
  /** Hard cap on callers waiting for a Blockbook permit. */
  BLOCKBOOK_QUEUE_MAX_DEPTH: number;
  /** Hard cap on how long a caller waits for a permit, in milliseconds. */
  BLOCKBOOK_QUEUE_MAX_WAIT_MS: number;
}

/**
 * Safe defaults, chosen to sit comfortably above legitimate traffic while
 * still bounding the worst case:
 *
 * - 256 KiB request body covers the largest legitimate payload (a raw signed
 *   Bitcoin transaction, max ~100 KB, hex-encoded to ~200 KB) with headroom,
 *   and is 4x tighter than the LoopBack/body-parser 1 MB default.
 * - 1.5 MiB provider response clears the largest response observed in practice
 *   (~0.93 MB for a heavily-used address) with room to spare. It is kept tight
 *   deliberately: it is the multiplier on every in-flight provider call, so
 *   worst-case buffered bytes is `BLOCKBOOK_MAX_IN_FLIGHT x` this value.
 * - 50 Blockbook operations in flight allows ten concurrent requests fanning
 *   out at full `PROVIDER_CONCURRENCY` while bounding worst-case buffering to
 *   roughly 75 MB. `PROVIDER_CONCURRENCY` bounds one request; this bounds the
 *   process, which is what concurrent callers would otherwise multiply.
 * - A queue of 100 with a 5 s ceiling absorbs bursts without becoming the next
 *   unbounded thing. The wait sits inside both `PROVIDER_TIMEOUT_MS` and
 *   `MAX_REQUEST_DURATION_MS`, so a queued request fails on the queue rather
 *   than by deadline.
 *
 * - 8 KiB error responses sit ~12x above the largest bounded error this service
 *   produces, and roughly three orders of magnitude below what an unbounded Ajv
 *   detail collection serializes to.
 * - 1 MiB of buffered response per connection is far above any single bounded
 *   response, but stops a peer that stops reading from accumulating pipelined
 *   responses in the process.
 * - A 30 s request deadline sits well above any legitimate request while
 *   bounding the fan-out arithmetic: 50 addresses at a concurrency of 5, each
 *   hop allowed `PROVIDER_TIMEOUT_MS` plus a retry, would otherwise let a
 *   single request occupy the process for minutes.
 *
 * Bridge ABI decoding is deliberately absent from this list: it is bounded by
 * requiring a successful transaction receipt before decoding, not by a size
 * budget. See `isSuccessfulReceipt` in `src/utils/bridge-utils.ts`.
 */
export const RESOURCE_BUDGET_DEFAULTS: Readonly<ResourceBudgets> = Object.freeze({
  MAX_REQUEST_BODY_BYTES: 256 * 1024,
  MAX_PROVIDER_RESPONSE_BYTES: 1536 * 1024,
  MAX_UTXOS_PER_ADDRESS: 1000,
  UTXO_RESPONSE_MAX_ROWS: 1000,
  MAX_ADDRESS_INFO_TXIDS: 100,
  PROVIDER_TIMEOUT_MS: 15_000,
  PROVIDER_MAX_RETRIES: 1,
  PROVIDER_RETRY_BASE_DELAY_MS: 100,
  // 120, because that is what the frontend derives from one extended public key
  // and what every environment file already overrode the old 50 to. The bounds
  // that keep it safe are the products, not the list length: retained txids are
  // ADDRESS_LIST_MAX_ITEMS x MAX_ADDRESS_INFO_TXIDS, and the fan-out runs
  // ADDRESS_LIST_MAX_ITEMS / PROVIDER_CONCURRENCY sequential batches.
  ADDRESS_LIST_MAX_ITEMS: 120,
  PROVIDER_CONCURRENCY: 5,
  MAX_ERROR_RESPONSE_BYTES: 8 * 1024,
  MAX_VALIDATION_ERROR_DETAILS: 3,
  MAX_CONNECTION_BUFFERED_BYTES: 1024 * 1024,
  MAX_REQUEST_DURATION_MS: 30_000,
  // Long enough for work that observes the abort signal to unwind and produce
  // its own answer, short enough that a caller is not left waiting on work that
  // ignores the signal entirely.
  REQUEST_DEADLINE_GRACE_MS: 250,
  // 30 s windows: long enough that a burst is visible, short enough that a
  // blocked client recovers quickly rather than being locked out.
  RATE_LIMIT_WINDOW_MS: 30_000,
  // 90 per window is ~3/s sustained, far above any interactive use of this API
  // and far below what it takes to hurt it.
  RATE_LIMIT_MAX_REQUESTS: 90,
  // The fan-out POSTs cost up to PROVIDER_CONCURRENCY provider calls each, so
  // they get a tighter allowance than the cheap GETs.
  RATE_LIMIT_MAX_FANOUT_REQUESTS: 15,
  // The limiter must not become the amplifier: an attacker with many source
  // addresses would otherwise grow this map without bound.
  RATE_LIMIT_MAX_TRACKED_CLIENTS: 4096,
  BLOCKBOOK_MAX_IN_FLIGHT: 50,
  BLOCKBOOK_QUEUE_MAX_DEPTH: 100,
  BLOCKBOOK_QUEUE_MAX_WAIT_MS: 5_000,
});

/**
 * Parses a strictly positive integer, falling back to `defaultVal` for
 * anything unusable (missing, non-numeric, zero, negative, infinite).
 *
 * @param raw - Raw environment-variable value.
 * @param defaultVal - Value to use when `raw` is unusable.
 * @returns The parsed integer, or `defaultVal`.
 */
export function parsePositiveInt(raw: string | undefined, defaultVal: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultVal;
}

/**
 * Parses a non-negative integer. Unlike {@link parsePositiveInt}, `0` is a
 * legitimate value (e.g. "no retries").
 *
 * @param raw - Raw environment-variable value.
 * @param defaultVal - Value to use when `raw` is unusable.
 * @returns The parsed integer, or `defaultVal`.
 */
export function parseNonNegativeInt(raw: string | undefined, defaultVal: number): number {
  if (raw === undefined || raw.trim() === '') {
    return defaultVal;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : defaultVal;
}

/**
 * Resolves every resource budget from an environment-variable source.
 *
 * Each budget is read from the environment variable that shares its name.
 * `ADDRESS_INFO_MAX_TXIDS` is still honoured as a legacy alias for
 * `MAX_ADDRESS_INFO_TXIDS`.
 *
 * @param env - Environment source to read from. Defaults to `process.env`.
 * @returns A fully resolved {@link ResourceBudgets}.
 */
export function loadResourceBudgets(env: EnvSource = process.env): ResourceBudgets {
  const d = RESOURCE_BUDGET_DEFAULTS;
  return {
    MAX_REQUEST_BODY_BYTES: parsePositiveInt(
      env.MAX_REQUEST_BODY_BYTES,
      d.MAX_REQUEST_BODY_BYTES,
    ),
    MAX_PROVIDER_RESPONSE_BYTES: parsePositiveInt(
      env.MAX_PROVIDER_RESPONSE_BYTES,
      d.MAX_PROVIDER_RESPONSE_BYTES,
    ),
    MAX_UTXOS_PER_ADDRESS: parsePositiveInt(
      env.MAX_UTXOS_PER_ADDRESS,
      d.MAX_UTXOS_PER_ADDRESS,
    ),
    UTXO_RESPONSE_MAX_ROWS: parsePositiveInt(
      env.UTXO_RESPONSE_MAX_ROWS,
      d.UTXO_RESPONSE_MAX_ROWS,
    ),
    MAX_ADDRESS_INFO_TXIDS: parsePositiveInt(
      env.MAX_ADDRESS_INFO_TXIDS ?? env.ADDRESS_INFO_MAX_TXIDS,
      d.MAX_ADDRESS_INFO_TXIDS,
    ),
    PROVIDER_TIMEOUT_MS: parsePositiveInt(
      env.PROVIDER_TIMEOUT_MS,
      d.PROVIDER_TIMEOUT_MS,
    ),
    PROVIDER_MAX_RETRIES: parseNonNegativeInt(
      env.PROVIDER_MAX_RETRIES,
      d.PROVIDER_MAX_RETRIES,
    ),
    PROVIDER_RETRY_BASE_DELAY_MS: parseNonNegativeInt(
      env.PROVIDER_RETRY_BASE_DELAY_MS,
      d.PROVIDER_RETRY_BASE_DELAY_MS,
    ),
    ADDRESS_LIST_MAX_ITEMS: parsePositiveInt(
      env.ADDRESS_LIST_MAX_ITEMS,
      d.ADDRESS_LIST_MAX_ITEMS,
    ),
    PROVIDER_CONCURRENCY: parsePositiveInt(
      env.PROVIDER_CONCURRENCY,
      d.PROVIDER_CONCURRENCY,
    ),
    MAX_ERROR_RESPONSE_BYTES: parsePositiveInt(
      env.MAX_ERROR_RESPONSE_BYTES,
      d.MAX_ERROR_RESPONSE_BYTES,
    ),
    MAX_VALIDATION_ERROR_DETAILS: parsePositiveInt(
      env.MAX_VALIDATION_ERROR_DETAILS,
      d.MAX_VALIDATION_ERROR_DETAILS,
    ),
    MAX_CONNECTION_BUFFERED_BYTES: parsePositiveInt(
      env.MAX_CONNECTION_BUFFERED_BYTES,
      d.MAX_CONNECTION_BUFFERED_BYTES,
    ),
    MAX_REQUEST_DURATION_MS: parsePositiveInt(
      env.MAX_REQUEST_DURATION_MS,
      d.MAX_REQUEST_DURATION_MS,
    ),
    REQUEST_DEADLINE_GRACE_MS: parsePositiveInt(
      env.REQUEST_DEADLINE_GRACE_MS,
      d.REQUEST_DEADLINE_GRACE_MS,
    ),
    RATE_LIMIT_WINDOW_MS: parsePositiveInt(
      env.RATE_LIMIT_WINDOW_MS,
      d.RATE_LIMIT_WINDOW_MS,
    ),
    RATE_LIMIT_MAX_REQUESTS: parsePositiveInt(
      env.RATE_LIMIT_MAX_REQUESTS,
      d.RATE_LIMIT_MAX_REQUESTS,
    ),
    RATE_LIMIT_MAX_FANOUT_REQUESTS: parsePositiveInt(
      env.RATE_LIMIT_MAX_FANOUT_REQUESTS,
      d.RATE_LIMIT_MAX_FANOUT_REQUESTS,
    ),
    RATE_LIMIT_MAX_TRACKED_CLIENTS: parsePositiveInt(
      env.RATE_LIMIT_MAX_TRACKED_CLIENTS,
      d.RATE_LIMIT_MAX_TRACKED_CLIENTS,
    ),
    BLOCKBOOK_MAX_IN_FLIGHT: parsePositiveInt(
      env.BLOCKBOOK_MAX_IN_FLIGHT,
      d.BLOCKBOOK_MAX_IN_FLIGHT,
    ),
    BLOCKBOOK_QUEUE_MAX_DEPTH: parsePositiveInt(
      env.BLOCKBOOK_QUEUE_MAX_DEPTH,
      d.BLOCKBOOK_QUEUE_MAX_DEPTH,
    ),
    BLOCKBOOK_QUEUE_MAX_WAIT_MS: parsePositiveInt(
      env.BLOCKBOOK_QUEUE_MAX_WAIT_MS,
      d.BLOCKBOOK_QUEUE_MAX_WAIT_MS,
    ),
  };
}

/** Budgets resolved once at module load from `process.env`. */
export const RESOURCE_BUDGETS: Readonly<ResourceBudgets> = Object.freeze(
  loadResourceBudgets(),
);

export const {
  MAX_REQUEST_BODY_BYTES,
  MAX_PROVIDER_RESPONSE_BYTES,
  MAX_UTXOS_PER_ADDRESS,
  UTXO_RESPONSE_MAX_ROWS,
  MAX_ADDRESS_INFO_TXIDS,
  PROVIDER_TIMEOUT_MS,
  PROVIDER_MAX_RETRIES,
  PROVIDER_RETRY_BASE_DELAY_MS,
  ADDRESS_LIST_MAX_ITEMS,
  PROVIDER_CONCURRENCY,
  MAX_ERROR_RESPONSE_BYTES,
  MAX_VALIDATION_ERROR_DETAILS,
  MAX_CONNECTION_BUFFERED_BYTES,
  MAX_REQUEST_DURATION_MS,
  REQUEST_DEADLINE_GRACE_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_MAX_FANOUT_REQUESTS,
  RATE_LIMIT_MAX_TRACKED_CLIENTS,
  BLOCKBOOK_MAX_IN_FLIGHT,
  BLOCKBOOK_QUEUE_MAX_DEPTH,
  BLOCKBOOK_QUEUE_MAX_WAIT_MS,
} = RESOURCE_BUDGETS;
