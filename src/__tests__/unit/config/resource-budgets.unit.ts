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
      expect(loadResourceBudgets({})).to.deepEqual({...RESOURCE_BUDGET_DEFAULTS});
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
      });
    });

    it('honours ADDRESS_INFO_MAX_TXIDS as a legacy alias', () => {
      expect(
        loadResourceBudgets({ADDRESS_INFO_MAX_TXIDS: '42'}).MAX_ADDRESS_INFO_TXIDS,
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
});
