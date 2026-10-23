import {expect} from '@loopback/testlab';
import {
  loadResourceBudgets,
  parseNonNegativeInt,
  parsePositiveInt,
  RESOURCE_BUDGET_DEFAULTS,
} from '../../../config/resource-budgets';

describe('Config: resource budgets', () => {
  describe('loadResourceBudgets', () => {
    it('falls back to the safe defaults when nothing is configured', () => {
      expect(loadResourceBudgets({})).to.deepEqual({
        ...RESOURCE_BUDGET_DEFAULTS,
      });
    });

    it('reads every budget from the environment', () => {
      const budgets = loadResourceBudgets({
        MAX_REQUEST_BODY_BYTES: '1024',
        MAX_PROVIDER_RESPONSE_BYTES: '2048',
        MAX_UTXOS_PER_ADDRESS: '7',
        UTXO_RESPONSE_MAX_ROWS: '11',
        MAX_ADDRESS_INFO_TXIDS: '13',
        PROVIDER_TIMEOUT_MS: '250',
        PROVIDER_MAX_RETRIES: '0',
        PROVIDER_RETRY_BASE_DELAY_MS: '0',
        ADDRESS_LIST_MAX_ITEMS: '3',
        PROVIDER_CONCURRENCY: '2',
        MAX_ERROR_RESPONSE_BYTES: '512',
        MAX_VALIDATION_ERROR_DETAILS: '2',
        MAX_CONNECTION_BUFFERED_BYTES: '4096',
        CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS: '25',
        CONNECTION_OUTPUT_STALL_MS: '500',
        MAX_TOTAL_PENDING_OUTPUT_BYTES: '8388608',
        CONNECTION_OUTPUT_AGGREGATE_STALL_MS: '75',
        MAX_REQUEST_DURATION_MS: '9000',
        REQUEST_DEADLINE_GRACE_MS: '250',
        RATE_LIMIT_WINDOW_MS: '30000',
        RATE_LIMIT_MAX_REQUESTS: '90',
        RATE_LIMIT_MAX_FANOUT_REQUESTS: '15',
        RATE_LIMIT_MAX_HEALTH_REQUESTS: '600',
        RATE_LIMIT_MAX_TRACKED_CLIENTS: '4096',
        RATE_LIMIT_TRUSTED_HOPS: '2',
        PROCESS_FAILURE_TRIPWIRE_MAX: '4',
        PROCESS_FAILURE_TRIPWIRE_WINDOW_MS: '15000',
        PROCESS_FAILURE_TRIPWIRE_MAX_KINDS: '32',
        MONGO_MAX_DOCUMENTS: '250',
        HEALTH_CACHE_TTL_MS: '2000',
        BLOCKBOOK_MAX_IN_FLIGHT: '7',
        BLOCKBOOK_QUEUE_MAX_DEPTH: '11',
        BLOCKBOOK_QUEUE_MAX_WAIT_MS: '2500',
        MAX_BRIDGE_CALLDATA_BYTES: '4096',
        MAX_TX_PROVIDER_RESPONSE_BYTES: '2097152',
        TX_PROVIDER_MAX_IN_FLIGHT: '3',
      });

      expect(budgets).to.deepEqual({
        MAX_REQUEST_BODY_BYTES: 1024,
        MAX_PROVIDER_RESPONSE_BYTES: 2048,
        MAX_UTXOS_PER_ADDRESS: 7,
        UTXO_RESPONSE_MAX_ROWS: 11,
        MAX_ADDRESS_INFO_TXIDS: 13,
        PROVIDER_TIMEOUT_MS: 250,
        PROVIDER_MAX_RETRIES: 0,
        PROVIDER_RETRY_BASE_DELAY_MS: 0,
        ADDRESS_LIST_MAX_ITEMS: 3,
        PROVIDER_CONCURRENCY: 2,
        MAX_ERROR_RESPONSE_BYTES: 512,
        MAX_VALIDATION_ERROR_DETAILS: 2,
        MAX_CONNECTION_BUFFERED_BYTES: 4096,
        CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS: 25,
        CONNECTION_OUTPUT_STALL_MS: 500,
        MAX_TOTAL_PENDING_OUTPUT_BYTES: 8388608,
        CONNECTION_OUTPUT_AGGREGATE_STALL_MS: 75,
        MAX_REQUEST_DURATION_MS: 9000,
        REQUEST_DEADLINE_GRACE_MS: 250,
        RATE_LIMIT_WINDOW_MS: 30000,
        RATE_LIMIT_MAX_REQUESTS: 90,
        RATE_LIMIT_MAX_FANOUT_REQUESTS: 15,
        RATE_LIMIT_MAX_HEALTH_REQUESTS: 600,
        RATE_LIMIT_MAX_TRACKED_CLIENTS: 4096,
        RATE_LIMIT_TRUSTED_HOPS: 2,
        PROCESS_FAILURE_TRIPWIRE_MAX: 4,
        PROCESS_FAILURE_TRIPWIRE_WINDOW_MS: 15000,
        PROCESS_FAILURE_TRIPWIRE_MAX_KINDS: 32,
        MONGO_MAX_DOCUMENTS: 250,
        HEALTH_CACHE_TTL_MS: 2000,
        BLOCKBOOK_MAX_IN_FLIGHT: 7,
        BLOCKBOOK_QUEUE_MAX_DEPTH: 11,
        BLOCKBOOK_QUEUE_MAX_WAIT_MS: 2500,
        MAX_BRIDGE_CALLDATA_BYTES: 4096,
        MAX_TX_PROVIDER_RESPONSE_BYTES: 2097152,
        TX_PROVIDER_MAX_IN_FLIGHT: 3,
      });
    });

    it('honours ADDRESS_INFO_MAX_TXIDS as a legacy alias', () => {
      expect(
        loadResourceBudgets({ADDRESS_INFO_MAX_TXIDS: '42'})
          .MAX_ADDRESS_INFO_TXIDS,
      ).to.equal(42);
    });

    it('prefers the canonical name over the legacy alias', () => {
      expect(
        loadResourceBudgets({
          MAX_ADDRESS_INFO_TXIDS: '10',
          ADDRESS_INFO_MAX_TXIDS: '42',
        }).MAX_ADDRESS_INFO_TXIDS,
      ).to.equal(10);
    });

    it('never lets an unusable value disable the concurrency limit', () => {
      // A zero permit count would deadlock every request rather than relaxing
      // a bound, so an unusable value must fall back, not pass through.
      const budgets = loadResourceBudgets({
        BLOCKBOOK_MAX_IN_FLIGHT: '0',
        BLOCKBOOK_QUEUE_MAX_DEPTH: '-5',
        BLOCKBOOK_QUEUE_MAX_WAIT_MS: 'never',
      });

      expect(budgets.BLOCKBOOK_MAX_IN_FLIGHT).to.equal(
        RESOURCE_BUDGET_DEFAULTS.BLOCKBOOK_MAX_IN_FLIGHT,
      );
      expect(budgets.BLOCKBOOK_QUEUE_MAX_DEPTH).to.equal(
        RESOURCE_BUDGET_DEFAULTS.BLOCKBOOK_QUEUE_MAX_DEPTH,
      );
      expect(budgets.BLOCKBOOK_QUEUE_MAX_WAIT_MS).to.equal(
        RESOURCE_BUDGET_DEFAULTS.BLOCKBOOK_QUEUE_MAX_WAIT_MS,
      );
    });


    it('never lets an unusable value disable the request deadline', () => {
      // A zero or negative deadline would mean "no deadline", the opposite of
      // what the budget exists for.
      expect(
        loadResourceBudgets({MAX_REQUEST_DURATION_MS: '0'})
          .MAX_REQUEST_DURATION_MS,
      ).to.equal(RESOURCE_BUDGET_DEFAULTS.MAX_REQUEST_DURATION_MS);
      expect(
        loadResourceBudgets({MAX_REQUEST_DURATION_MS: 'forever'})
          .MAX_REQUEST_DURATION_MS,
      ).to.equal(RESOURCE_BUDGET_DEFAULTS.MAX_REQUEST_DURATION_MS);
    });

    it('never lets an unusable value disable the error-response budgets', () => {
      // A zero or negative ceiling would mean "no bound at all", which is the
      // opposite of what these budgets exist for.
      const budgets = loadResourceBudgets({
        MAX_ERROR_RESPONSE_BYTES: '0',
        MAX_VALIDATION_ERROR_DETAILS: '-1',
        MAX_CONNECTION_BUFFERED_BYTES: 'unbounded',
      });

      expect(budgets.MAX_ERROR_RESPONSE_BYTES).to.equal(
        RESOURCE_BUDGET_DEFAULTS.MAX_ERROR_RESPONSE_BYTES,
      );
      expect(budgets.MAX_VALIDATION_ERROR_DETAILS).to.equal(
        RESOURCE_BUDGET_DEFAULTS.MAX_VALIDATION_ERROR_DETAILS,
      );
      expect(budgets.MAX_CONNECTION_BUFFERED_BYTES).to.equal(
        RESOURCE_BUDGET_DEFAULTS.MAX_CONNECTION_BUFFERED_BYTES,
      );
    });

    it('never lets an unusable value disable the bridge calldata bound', () => {
      // Zero would refuse every Bridge transaction and a negative value would
      // mean "no bound"; both are worse than the default, so both fall back.
      ['0', '-1', 'unbounded', ''].forEach(raw => {
        expect(
          loadResourceBudgets({MAX_BRIDGE_CALLDATA_BYTES: raw})
            .MAX_BRIDGE_CALLDATA_BYTES,
        ).to.equal(RESOURCE_BUDGET_DEFAULTS.MAX_BRIDGE_CALLDATA_BYTES);
      });
    });

    it('ignores unusable values rather than disabling a budget', () => {
      const budgets = loadResourceBudgets({
        MAX_REQUEST_BODY_BYTES: '0',
        MAX_PROVIDER_RESPONSE_BYTES: '-1',
        UTXO_RESPONSE_MAX_ROWS: 'not-a-number',
        PROVIDER_MAX_RETRIES: '-3',
      });

      expect(budgets.MAX_REQUEST_BODY_BYTES).to.equal(
        RESOURCE_BUDGET_DEFAULTS.MAX_REQUEST_BODY_BYTES,
      );
      expect(budgets.MAX_PROVIDER_RESPONSE_BYTES).to.equal(
        RESOURCE_BUDGET_DEFAULTS.MAX_PROVIDER_RESPONSE_BYTES,
      );
      expect(budgets.UTXO_RESPONSE_MAX_ROWS).to.equal(
        RESOURCE_BUDGET_DEFAULTS.UTXO_RESPONSE_MAX_ROWS,
      );
      expect(budgets.PROVIDER_MAX_RETRIES).to.equal(
        RESOURCE_BUDGET_DEFAULTS.PROVIDER_MAX_RETRIES,
      );
    });
  });

  describe('parsers', () => {
    it('parsePositiveInt truncates and rejects non-positive input', () => {
      expect(parsePositiveInt('5.9', 1)).to.equal(5);
      expect(parsePositiveInt('0', 1)).to.equal(1);
      expect(parsePositiveInt(undefined, 1)).to.equal(1);
      expect(parsePositiveInt('Infinity', 1)).to.equal(1);
    });

    it('parseNonNegativeInt accepts zero but not negatives', () => {
      expect(parseNonNegativeInt('0', 3)).to.equal(0);
      expect(parseNonNegativeInt('-1', 3)).to.equal(3);
      expect(parseNonNegativeInt('  ', 3)).to.equal(3);
      expect(parseNonNegativeInt(undefined, 3)).to.equal(3);
    });
  });

  describe('worst-case provider buffering', () => {
    // The memory a burst can occupy is the product of these two budgets, not
    // either one alone. Raising either without checking the product is how a
    // bounded service becomes unbounded again, so the product is asserted
    // rather than left implicit.
    const MAX_WORST_CASE_BYTES = 128 * 1024 * 1024;

    it('keeps in-flight bytes within a documented ceiling', () => {
      const {BLOCKBOOK_MAX_IN_FLIGHT, MAX_PROVIDER_RESPONSE_BYTES} =
        RESOURCE_BUDGET_DEFAULTS;

      expect(
        BLOCKBOOK_MAX_IN_FLIGHT * MAX_PROVIDER_RESPONSE_BYTES,
      ).to.be.lessThanOrEqual(MAX_WORST_CASE_BYTES);
    });

    it('accepts the whole address list the frontend actually sends', () => {
      // The frontend derives up to 120 addresses from one extended public key,
      // and every environment file overrode the built-in 50 to say so. A default
      // that no deployment uses is a default that misleads: the code, the docs
      // and the environment now agree, and the ceilings above are what keep 120
      // bounded rather than a lower list length nobody runs.
      expect(RESOURCE_BUDGET_DEFAULTS.ADDRESS_LIST_MAX_ITEMS).to.equal(120);
    });

    it('keeps the retained txid count within a documented ceiling', () => {
      // `/addresses-info` retains up to MAX_ADDRESS_INFO_TXIDS per address for
      // every address in the list, so the product is what bounds the response —
      // raising the list length alone silently multiplies it.
      const MAX_RETAINED_TXIDS = 20_000;
      const {ADDRESS_LIST_MAX_ITEMS, MAX_ADDRESS_INFO_TXIDS} =
        RESOURCE_BUDGET_DEFAULTS;

      expect(
        ADDRESS_LIST_MAX_ITEMS * MAX_ADDRESS_INFO_TXIDS,
      ).to.be.lessThanOrEqual(MAX_RETAINED_TXIDS);
    });

    it('keeps the fan-out within the request deadline', () => {
      // The list is walked PROVIDER_CONCURRENCY at a time, so the list length
      // decides how many sequential batches a request needs. Each batch can take
      // up to PROVIDER_TIMEOUT_MS, and a request that cannot finish inside its
      // own deadline now ends in a 503 rather than a slow success.
      const {
        ADDRESS_LIST_MAX_ITEMS,
        PROVIDER_CONCURRENCY,
        MAX_REQUEST_DURATION_MS,
        PROVIDER_TIMEOUT_MS,
      } = RESOURCE_BUDGET_DEFAULTS;
      const batches = Math.ceil(ADDRESS_LIST_MAX_ITEMS / PROVIDER_CONCURRENCY);

      // Deliberately asserted against a *typical* per-batch latency rather than
      // the timeout: at PROVIDER_TIMEOUT_MS per batch nothing this size could
      // ever fit, so that arithmetic would only ever say "impossible". What is
      // worth guarding is that the ordinary case has headroom.
      const TYPICAL_BATCH_MS = 400;
      expect(batches * TYPICAL_BATCH_MS).to.be.lessThan(MAX_REQUEST_DURATION_MS);
      // And record the worst case explicitly, so it is a known trade-off rather
      // than a surprise: a uniformly slow provider cannot fit.
      expect(batches * PROVIDER_TIMEOUT_MS).to.be.greaterThan(
        MAX_REQUEST_DURATION_MS,
      );
    });

    it('bounds what the rate limiter itself can retain', () => {
      // A limiter that tracks every source address it sees is a memory
      // amplifier: an attacker with many addresses fills the map. The tracked
      // client count is therefore a budget in its own right, and the per-entry
      // cost times that bound is what has to stay small.
      const MAX_LIMITER_BYTES = 4 * 1024 * 1024;
      // A key (an address string) plus a count and a window stamp. Generous on
      // purpose: the assertion should hold without depending on V8 internals.
      const BYTES_PER_TRACKED_CLIENT = 256;

      expect(
        RESOURCE_BUDGET_DEFAULTS.RATE_LIMIT_MAX_TRACKED_CLIENTS *
          BYTES_PER_TRACKED_CLIENT,
      ).to.be.lessThanOrEqual(MAX_LIMITER_BYTES);
    });

    it('defaults to the topology that is safe to be wrong about', () => {
      // The client is read this many entries from the right of
      // `X-Forwarded-For`. Configured too high, the chain is shorter than
      // expected and every request falls back to the socket peer — a shared
      // bucket, which is a throughput problem. Configured too low, the entry
      // read is one the client supplied, which is the defect. So the
      // default is the smallest real topology, and raising it is a deliberate
      // per-environment act.
      expect(RESOURCE_BUDGET_DEFAULTS.RATE_LIMIT_TRUSTED_HOPS).to.equal(1);
    });

    it('qualifies stuck bytes faster than a connection is allowed to stall', () => {
      // The two thresholds do different jobs and the order matters. A single
      // stuck connection is the per-connection rule's business, judged
      // generously. The aggregate has to notice a *group* well before any one of
      // them has exhausted that allowance, or it never adds anything.
      const {CONNECTION_OUTPUT_AGGREGATE_STALL_MS, CONNECTION_OUTPUT_STALL_MS} =
        RESOURCE_BUDGET_DEFAULTS;

      expect(CONNECTION_OUTPUT_AGGREGATE_STALL_MS).to.be.lessThan(
        CONNECTION_OUTPUT_STALL_MS,
      );
    });

    it('keeps the aggregate ceiling above a single connection allowance', () => {
      // Below it, the ceiling would fire on one ordinary large response and the
      // per-connection budget would be dead configuration.
      const {MAX_TOTAL_PENDING_OUTPUT_BYTES, MAX_CONNECTION_BUFFERED_BYTES} =
        RESOURCE_BUDGET_DEFAULTS;

      expect(MAX_TOTAL_PENDING_OUTPUT_BYTES).to.be.greaterThan(
        MAX_CONNECTION_BUFFERED_BYTES,
      );
    });

    it('leaves monitoring far more headroom than it needs', () => {
      // `/health` traded an exemption for an allowance, and the allowance is
      // only defensible if it cannot refuse real monitoring. Expressed as a
      // rate: the budget has to clear a 1 Hz poller by a wide margin, or the
      // trade has quietly made the limiter an outage detector.
      const {RATE_LIMIT_MAX_HEALTH_REQUESTS, RATE_LIMIT_WINDOW_MS} =
        RESOURCE_BUDGET_DEFAULTS;
      const perSecond = RATE_LIMIT_MAX_HEALTH_REQUESTS / (RATE_LIMIT_WINDOW_MS / 1000);

      expect(perSecond).to.be.greaterThanOrEqual(10);
      // And it still has to be a ceiling rather than a formality.
      expect(RATE_LIMIT_MAX_HEALTH_REQUESTS).to.be.lessThan(10_000);
    });

    it('gives monitoring more room than ordinary public traffic', () => {
      expect(
        RESOURCE_BUDGET_DEFAULTS.RATE_LIMIT_MAX_HEALTH_REQUESTS,
      ).to.be.greaterThan(RESOURCE_BUDGET_DEFAULTS.RATE_LIMIT_MAX_REQUESTS);
    });

    it('limits the expensive routes more tightly than the cheap ones', () => {
      // The fan-out POSTs each cost up to PROVIDER_CONCURRENCY provider calls,
      // so an allowance that made sense for GET /api would be far too generous
      // for them.
      const {RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_MAX_FANOUT_REQUESTS} =
        RESOURCE_BUDGET_DEFAULTS;

      expect(RATE_LIMIT_MAX_FANOUT_REQUESTS).to.be.lessThan(
        RATE_LIMIT_MAX_REQUESTS,
      );
    });

    it('keeps the worst-case bridge decode heap within a documented ceiling', () => {
      // The measured amplification of the ABI decoder is ~225x calldata into
      // heap (28 MiB from 131 KB, 57 MiB from 262 KB, 225 MiB from 1.05 MB).
      // The bound that matters is the product with how many such requests can
      // be in flight, which is why /tx-status and /tx-status-by-type are
      // rate-limited as fan-out routes: raising either number alone silently
      // multiplies the worst case. 128 MiB leaves room inside a 512 MB heap.
      const DECODE_HEAP_AMPLIFICATION = 225;
      const MAX_WORST_CASE_DECODE_BYTES = 128 * 1024 * 1024;
      const {MAX_BRIDGE_CALLDATA_BYTES, RATE_LIMIT_MAX_FANOUT_REQUESTS} =
        RESOURCE_BUDGET_DEFAULTS;

      expect(
        MAX_BRIDGE_CALLDATA_BYTES *
          DECODE_HEAP_AMPLIFICATION *
          RATE_LIMIT_MAX_FANOUT_REQUESTS,
      ).to.be.lessThanOrEqual(MAX_WORST_CASE_DECODE_BYTES);
    });

    it('bounds the queue by the same reasoning', () => {
      // A queued caller holds no response bytes, so the queue is cheap — but
      // it must still be finite, or the queue becomes the unbounded thing.
      expect(
        Number.isFinite(RESOURCE_BUDGET_DEFAULTS.BLOCKBOOK_QUEUE_MAX_DEPTH),
      ).to.be.true();
      expect(
        RESOURCE_BUDGET_DEFAULTS.BLOCKBOOK_QUEUE_MAX_DEPTH,
      ).to.be.greaterThan(0);
    });
  });
});
