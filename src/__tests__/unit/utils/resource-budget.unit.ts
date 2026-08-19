import {expect} from '@loopback/testlab';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  assertWithinBudget,
  budgetExceededError,
  recordBudgetViolation,
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

describe('Utils: resource budget', () => {
  beforeEach(resetMetricCounters);

  describe('assertWithinBudget', () => {
    it('accepts an observed value immediately below the budget', () => {
      expect(() =>
        assertWithinBudget({
          resource: ResourceBudgetName.UTXO_RESPONSE_ROWS,
          configuredLimit: 100,
          observedValue: 99,
        }),
      ).to.not.throw();
    });

    it('accepts an observed value exactly at the budget', () => {
      expect(() =>
        assertWithinBudget({
          resource: ResourceBudgetName.UTXO_RESPONSE_ROWS,
          configuredLimit: 100,
          observedValue: 100,
        }),
      ).to.not.throw();
    });

    it('rejects an observed value immediately above the budget with a 413', () => {
      let caught: any = null;
      try {
        assertWithinBudget({
          resource: ResourceBudgetName.UTXO_RESPONSE_ROWS,
          configuredLimit: 100,
          observedValue: 101,
        });
      } catch (err) {
        caught = err;
      }

      expect(caught).to.not.be.null();
      expect(caught.statusCode).to.equal(413);
    });

    it('maps provider-driven violations to a 502', () => {
      let caught: any = null;
      try {
        assertWithinBudget(
          {
            resource: ResourceBudgetName.PROVIDER_RESPONSE_BYTES,
            configuredLimit: 10,
            observedValue: 11,
          },
          'provider',
        );
      } catch (err) {
        caught = err;
      }

      expect(caught).to.not.be.null();
      expect(caught.statusCode).to.equal(502);
    });

    it('does not record a violation while inside the budget', () => {
      assertWithinBudget({
        resource: ResourceBudgetName.UTXO_RESPONSE_ROWS,
        configuredLimit: 100,
        observedValue: 100,
      });

      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.UTXO_RESPONSE_ROWS,
        }),
      ).to.equal(0);
    });
  });

  describe('observability', () => {
    it('counts violations per resource', () => {
      recordBudgetViolation({
        resource: ResourceBudgetName.ADDRESS_LIST_ITEMS,
        configuredLimit: 1,
        observedValue: 2,
      });
      recordBudgetViolation({
        resource: ResourceBudgetName.ADDRESS_LIST_ITEMS,
        configuredLimit: 1,
        observedValue: 3,
      });
      recordBudgetViolation({
        resource: ResourceBudgetName.REQUEST_BODY_BYTES,
        configuredLimit: 1,
        observedValue: 4,
      });

      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.ADDRESS_LIST_ITEMS,
        }),
      ).to.equal(2);
      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.REQUEST_BODY_BYTES,
        }),
      ).to.equal(1);
    });

    it('keeps the error message free of any payload', () => {
      const err = budgetExceededError({
        resource: ResourceBudgetName.REQUEST_BODY_BYTES,
        configuredLimit: 10,
        observedValue: 20,
        route: 'POST /utxo',
        detail: 'declared content-length',
      });

      expect(err.message).to.equal(
        'Resource budget exceeded: request_body_bytes observed 20, ' +
          'configured limit 10 (declared content-length)',
      );
    });
  });
});
