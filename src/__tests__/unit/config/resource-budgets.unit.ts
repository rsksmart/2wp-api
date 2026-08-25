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
        MAX_REQUEST_DURATION_MS: '9000',
        REQUEST_DEADLINE_GRACE_MS: '250',
        BLOCKBOOK_MAX_IN_FLIGHT: '7',
        BLOCKBOOK_QUEUE_MAX_DEPTH: '11',
        BLOCKBOOK_QUEUE_MAX_WAIT_MS: '2500',
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
        MAX_REQUEST_DURATION_MS: 9000,
        REQUEST_DEADLINE_GRACE_MS: 250,
        BLOCKBOOK_MAX_IN_FLIGHT: 7,
        BLOCKBOOK_QUEUE_MAX_DEPTH: 11,
        BLOCKBOOK_QUEUE_MAX_WAIT_MS: 2500,
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
