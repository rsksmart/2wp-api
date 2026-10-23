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
  /** How often a response's socket buffer is sampled while it is in flight. */
  CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS: number;
  /** How long a socket may sit over budget without draining before it is dropped. */
  CONNECTION_OUTPUT_STALL_MS: number;
  /** Hard cap on stuck response bytes across every connection at once. */
  MAX_TOTAL_PENDING_OUTPUT_BYTES: number;
  /** How long a connection must be stuck before its bytes count towards that cap. */
  CONNECTION_OUTPUT_AGGREGATE_STALL_MS: number;
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
  /** Requests one client may make per window against `/health`. */
  RATE_LIMIT_MAX_HEALTH_REQUESTS: number;
  /** Hard cap on how many clients the limiter will track at once. */
  RATE_LIMIT_MAX_TRACKED_CLIENTS: number;
  /** Proxies between the client and this service, for reading `X-Forwarded-For`. */
  RATE_LIMIT_TRUSTED_HOPS: number;
  /** Occurrences of one kind of process failure survived within one window. */
  PROCESS_FAILURE_TRIPWIRE_MAX: number;
  /** Length of the process-failure tripwire's fixed window, in milliseconds. */
  PROCESS_FAILURE_TRIPWIRE_WINDOW_MS: number;
  /** Hard cap on how many distinct failure kinds the tripwire tracks. */
  PROCESS_FAILURE_TRIPWIRE_MAX_KINDS: number;
  /** Hard cap on documents returned by one database read. */
  MONGO_MAX_DOCUMENTS: number;
  /** How long a health result may be reused, in milliseconds. */
  HEALTH_CACHE_TTL_MS: number;
  /** Hard cap on Blockbook operations in flight across the whole process. */
  BLOCKBOOK_MAX_IN_FLIGHT: number;
  /** Hard cap on callers waiting for a Blockbook permit. */
  BLOCKBOOK_QUEUE_MAX_DEPTH: number;
  /** Hard cap on how long a caller waits for a permit, in milliseconds. */
  BLOCKBOOK_QUEUE_MAX_WAIT_MS: number;
  /** Hard cap on calldata handed to the Bridge ABI decoder, in bytes. */
  MAX_BRIDGE_CALLDATA_BYTES: number;
  /** Hard cap on one transaction-lookup provider response, in bytes. */
  MAX_TX_PROVIDER_RESPONSE_BYTES: number;
  /** Hard cap on transaction lookups in flight across the whole process. */
  TX_PROVIDER_MAX_IN_FLIGHT: number;
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
 * - 32 KiB of Bridge calldata is derived, not guessed, from both directions.
 *
 *   Above: ABI decoding amplifies calldata into heap by a measured ~225x
 *   (+26.7 MiB from 131 KB, +55.2 MiB from 262 KB, +225.0 MiB from 1.05 MB), so
 *   the worst case is `225 x MAX_BRIDGE_CALLDATA_BYTES x concurrent requests`.
 *   At 32 KiB that is ~7.2 MiB per request. The second factor is why
 *   `/tx-status` and `/tx-status-by-type` are counted as fan-out routes by the
 *   rate limiter: the two bounds hold each other up, and the test file asserts
 *   their product.
 *
 *   Below: 12 000 recent blocks on each of mainnet and testnet (3 769 successful
 *   Bridge transactions) give p50 = 4 B, p90 = 228 B, p99 = 868 B, p100 = 1604 B.
 *   32 KiB clears the observed maximum by 20x. That margin is not decoration — a
 *   bound set too low does not fail loudly, it leaves legitimate pegouts in a
 *   status that never resolves.
 *
 *   The thin spot is `registerBtcTransaction`, which carries a user-supplied
 *   Bitcoin transaction: 32 KiB covers a pegin of roughly 215 inputs. A larger
 *   one is legal and would be skipped by the daemon — logged and counted, not
 *   silent — and is recovered by raising this variable.
 *
 * - 8 MiB for a transaction lookup, with a pool of 4, and the two are one
 *   decision. `GET /tx` returns the raw Bitcoin transaction in `hex`, which is
 *   the public contract, so these responses are megabytes where every other
 *   Blockbook call is kilobytes — the general 1.5 MiB budget would refuse
 *   legitimate lookups, and that fails quietly as a 502 nobody notices.
 *
 *   Below: across 376 transactions sampled from recent blocks on the testnet
 *   Blockbook this service actually uses, `/api/v2/tx` runs p50 = 1.5 KB with a
 *   p100 of 745 KB, and `/api/v1/tx` agrees. 8 MiB clears that by 11x. Worked
 *   out rather than sampled, since testnet carries no large transactions: a 1 MB
 *   Bitcoin transaction renders to ~3.3 MB of response (2 chars of hex per byte,
 *   plus ~210 bytes of JSON per input), so the bound covers any standard
 *   transaction. A consensus-maximum 4 MB-weight transaction would render to
 *   ~13 MB and be refused — legal, never yet seen, and recoverable by raising
 *   the variable.
 *
 *   Above: materializing a response costs several times its wire size (Buffer,
 *   then `toString` to UTF-16, then `JSON.parse` to objects), so the process-wide
 *   figure is `3 x budget x in-flight`. At 8 MiB on the general 50-slot pool that
 *   is over a gigabyte, which is why these calls have their own pool of 4 and
 *   why `tx-provider-budget.unit.ts` asserts the product rather than either
 *   number.
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
  // Measured on a 7.5 MB response under 48-way concurrency. A socket is over
  // budget for at most 70 ms (median 45) before its response closes, and a peer
  // that has stopped reading stays over budget indefinitely. Duration is the only
  // discriminator that survives contact with load: `writableLength` sits at the
  // *same* value across consecutive samples for a draining socket too, because a
  // busy event loop does not hand bytes to the kernel between two samples — so
  // "is the buffer going down" is not observable here, and only "how long has it
  // been stuck" is.
  //
  // 1 s is 14x the longest legitimate stall observed, which is the margin that
  // keeps this from dropping a slow-but-reading client. See the note in
  // `docs/resource-budgets.md` on what that margin costs.
  CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS: 50,
  CONNECTION_OUTPUT_STALL_MS: 1_000,
  // The ceiling counts only bytes held by connections that are *stuck*, which is
  // what makes a low number safe. Measured across 48 concurrent 7.5 MB
  // responses: legitimate clients peak at 60 MB of pending bytes in total, but no
  // single one of them is over its per-connection budget for more than 70 ms, so
  // after the qualifying delay below none of those bytes count. A peer that has
  // stopped reading holds its bytes indefinitely and every one of them counts.
  //
  // 16 MiB is therefore roughly two stuck large responses. The margin is not the
  // gap between 16 MiB and legitimate usage — legitimate usage of *stuck* bytes
  // is zero — it is that a legitimate client would have to stay stuck past the
  // qualifying delay at all, which none was ever measured doing.
  MAX_TOTAL_PENDING_OUTPUT_BYTES: 16 * 1024 * 1024,
  // How long a connection must be stuck before its bytes count. The whole design
  // rests on this number, so it is measured on both sides rather than reasoned
  // about: across 48 concurrent 7.5 MB responses, legitimate clients contribute
  // **0 bytes** of stuck data at this threshold, and a burst of non-readers
  // contributes 30 MB. Raising it to 200 ms drops the burst's contribution to
  // 7.5 MB, because fewer connections have time to qualify before the damage is
  // done — so higher is not safer here, it is blinder.
  CONNECTION_OUTPUT_AGGREGATE_STALL_MS: 100,
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
  // `/health` was exempt, which made it the one route in the API with no
  // ceiling — and the trigger for the outage this budget was added alongside. It
  // is generous rather than absent: 600 per 30 s window is 20/s, orders of
  // magnitude above any monitoring cadence, so the guarantee the exemption
  // existed for still holds. Its upstream cost is already bounded by
  // HEALTH_CACHE_TTL_MS, so this bounds the request rate itself, not the fan-out.
  RATE_LIMIT_MAX_HEALTH_REQUESTS: 600,
  // The limiter must not become the amplifier: an attacker with many source
  // addresses would otherwise grow this map without bound.
  RATE_LIMIT_MAX_TRACKED_CLIENTS: 4096,
  // How far from the *right* of `X-Forwarded-For` the client's address sits.
  // A proxy appends the address it observed, so with one proxy in front the last
  // entry is what that proxy actually saw and everything to its left is client
  // input. 1 is the single-load-balancer case; a CDN in front of a load balancer
  // is 2. Getting this wrong is not a degradation, it is the same forgeable
  // identity in the opposite direction, so it is deployment configuration rather
  // than something inferred at runtime.
  RATE_LIMIT_TRUSTED_HOPS: 1,
  // An unhandled rejection is one broken request and is survived. Ten of the
  // same kind inside a minute is not a request failing, it is the process stuck
  // failing the same way — high enough that a transient outage does not reach it,
  // low enough that a real degradation does. Calibrate against staging.
  PROCESS_FAILURE_TRIPWIRE_MAX: 10,
  PROCESS_FAILURE_TRIPWIRE_WINDOW_MS: 60_000,
  // The tripwire must not become the amplifier, for the same reason
  // RATE_LIMIT_MAX_TRACKED_CLIENTS exists: past this ceiling every further kind
  // counts in one shared bucket rather than allocating a new one.
  PROCESS_FAILURE_TRIPWIRE_MAX_KINDS: 64,
  // The collections behind the public routes are small and operator-managed —
  // there are 14 feature flags today. This is not a page size, it is a ceiling
  // that stops an unbounded read from becoming unbounded memory if a collection
  // ever grows unexpectedly.
  MONGO_MAX_DOCUMENTS: 250,
  // Short enough that a readiness signal stays current, long enough that a
  // monitoring loop — or an attacker in one — cannot multiply upstream load.
  HEALTH_CACHE_TTL_MS: 2_000,
  BLOCKBOOK_MAX_IN_FLIGHT: 50,
  BLOCKBOOK_QUEUE_MAX_DEPTH: 100,
  BLOCKBOOK_QUEUE_MAX_WAIT_MS: 5_000,
  MAX_BRIDGE_CALLDATA_BYTES: 32 * 1024,
  MAX_TX_PROVIDER_RESPONSE_BYTES: 8 * 1024 * 1024,
  TX_PROVIDER_MAX_IN_FLIGHT: 4,
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
    CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS: parsePositiveInt(
      env.CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS,
      d.CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS,
    ),
    CONNECTION_OUTPUT_STALL_MS: parsePositiveInt(
      env.CONNECTION_OUTPUT_STALL_MS,
      d.CONNECTION_OUTPUT_STALL_MS,
    ),
    MAX_TOTAL_PENDING_OUTPUT_BYTES: parsePositiveInt(
      env.MAX_TOTAL_PENDING_OUTPUT_BYTES,
      d.MAX_TOTAL_PENDING_OUTPUT_BYTES,
    ),
    CONNECTION_OUTPUT_AGGREGATE_STALL_MS: parsePositiveInt(
      env.CONNECTION_OUTPUT_AGGREGATE_STALL_MS,
      d.CONNECTION_OUTPUT_AGGREGATE_STALL_MS,
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
    RATE_LIMIT_MAX_HEALTH_REQUESTS: parsePositiveInt(
      env.RATE_LIMIT_MAX_HEALTH_REQUESTS,
      d.RATE_LIMIT_MAX_HEALTH_REQUESTS,
    ),
    RATE_LIMIT_MAX_TRACKED_CLIENTS: parsePositiveInt(
      env.RATE_LIMIT_MAX_TRACKED_CLIENTS,
      d.RATE_LIMIT_MAX_TRACKED_CLIENTS,
    ),
    RATE_LIMIT_TRUSTED_HOPS: parsePositiveInt(
      env.RATE_LIMIT_TRUSTED_HOPS,
      d.RATE_LIMIT_TRUSTED_HOPS,
    ),
    PROCESS_FAILURE_TRIPWIRE_MAX: parsePositiveInt(
      env.PROCESS_FAILURE_TRIPWIRE_MAX,
      d.PROCESS_FAILURE_TRIPWIRE_MAX,
    ),
    PROCESS_FAILURE_TRIPWIRE_WINDOW_MS: parsePositiveInt(
      env.PROCESS_FAILURE_TRIPWIRE_WINDOW_MS,
      d.PROCESS_FAILURE_TRIPWIRE_WINDOW_MS,
    ),
    PROCESS_FAILURE_TRIPWIRE_MAX_KINDS: parsePositiveInt(
      env.PROCESS_FAILURE_TRIPWIRE_MAX_KINDS,
      d.PROCESS_FAILURE_TRIPWIRE_MAX_KINDS,
    ),
    MONGO_MAX_DOCUMENTS: parsePositiveInt(
      env.MONGO_MAX_DOCUMENTS,
      d.MONGO_MAX_DOCUMENTS,
    ),
    HEALTH_CACHE_TTL_MS: parsePositiveInt(
      env.HEALTH_CACHE_TTL_MS,
      d.HEALTH_CACHE_TTL_MS,
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
    MAX_BRIDGE_CALLDATA_BYTES: parsePositiveInt(
      env.MAX_BRIDGE_CALLDATA_BYTES,
      d.MAX_BRIDGE_CALLDATA_BYTES,
    ),
    MAX_TX_PROVIDER_RESPONSE_BYTES: parsePositiveInt(
      env.MAX_TX_PROVIDER_RESPONSE_BYTES,
      d.MAX_TX_PROVIDER_RESPONSE_BYTES,
    ),
    TX_PROVIDER_MAX_IN_FLIGHT: parsePositiveInt(
      env.TX_PROVIDER_MAX_IN_FLIGHT,
      d.TX_PROVIDER_MAX_IN_FLIGHT,
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
  CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS,
  CONNECTION_OUTPUT_STALL_MS,
  MAX_TOTAL_PENDING_OUTPUT_BYTES,
  CONNECTION_OUTPUT_AGGREGATE_STALL_MS,
  MAX_REQUEST_DURATION_MS,
  REQUEST_DEADLINE_GRACE_MS,
  RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_MAX_FANOUT_REQUESTS,
  RATE_LIMIT_MAX_HEALTH_REQUESTS,
  RATE_LIMIT_MAX_TRACKED_CLIENTS,
  RATE_LIMIT_TRUSTED_HOPS,
  PROCESS_FAILURE_TRIPWIRE_MAX,
  PROCESS_FAILURE_TRIPWIRE_WINDOW_MS,
  PROCESS_FAILURE_TRIPWIRE_MAX_KINDS,
  MONGO_MAX_DOCUMENTS,
  HEALTH_CACHE_TTL_MS,
  BLOCKBOOK_MAX_IN_FLIGHT,
  BLOCKBOOK_QUEUE_MAX_DEPTH,
  BLOCKBOOK_QUEUE_MAX_WAIT_MS,
  MAX_BRIDGE_CALLDATA_BYTES,
  MAX_TX_PROVIDER_RESPONSE_BYTES,
  TX_PROVIDER_MAX_IN_FLIGHT,
} = RESOURCE_BUDGETS;
