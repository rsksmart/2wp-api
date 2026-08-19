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
}

/**
 * Safe defaults, chosen to sit comfortably above legitimate traffic while
 * still bounding the worst case:
 *
 * - 256 KiB request body covers the largest legitimate payload (a raw signed
 *   Bitcoin transaction, max ~100 KB, hex-encoded to ~200 KB) with headroom,
 *   and is 4x tighter than the LoopBack/body-parser 1 MB default.
 * - 4 MiB provider response covers a 1000-row Blockbook UTXO page (~200 KB)
 *   and a `details=txids` address page with headroom.
 *
 * Bridge ABI decoding is deliberately absent from this list: it is bounded by
 * requiring a successful transaction receipt before decoding, not by a size
 * budget. See `isSuccessfulReceipt` in `src/utils/bridge-utils.ts`.
 */
export const RESOURCE_BUDGET_DEFAULTS: Readonly<ResourceBudgets> = Object.freeze({
  MAX_REQUEST_BODY_BYTES: 256 * 1024,
  MAX_PROVIDER_RESPONSE_BYTES: 4 * 1024 * 1024,
  MAX_UTXOS_PER_ADDRESS: 1000,
  UTXO_RESPONSE_MAX_ROWS: 1000,
  MAX_ADDRESS_INFO_TXIDS: 100,
  PROVIDER_TIMEOUT_MS: 15_000,
  PROVIDER_MAX_RETRIES: 1,
  PROVIDER_RETRY_BASE_DELAY_MS: 100,
  ADDRESS_LIST_MAX_ITEMS: 50,
  PROVIDER_CONCURRENCY: 5,
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
} = RESOURCE_BUDGETS;
