import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {MiddlewareContext} from '@loopback/rest';
import {MAX_REQUEST_BODY_BYTES} from '../../../config/resource-budgets';
import {requestBodyBudgetMiddleware} from '../../../middleware/request-body-budget.middleware';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

/** Minimal MiddlewareContext stand-in carrying just the request headers. */
const givenContext = (contentLength?: string): MiddlewareContext =>
  ({
    request: {
      method: 'POST',
      path: '/utxo',
      headers: contentLength === undefined ? {} : {'content-length': contentLength},
    },
  } as unknown as MiddlewareContext);

describe('Middleware: request body budget', () => {
  beforeEach(resetMetricCounters);

  it('passes a body immediately below the budget through', async () => {
    const next = sinon.stub().resolves('handled');
    const result = await requestBodyBudgetMiddleware(
      givenContext(String(MAX_REQUEST_BODY_BYTES - 1)),
      next,
    );

    expect(result).to.equal('handled');
    sinon.assert.calledOnce(next);
  });

  it('passes a body exactly at the budget through', async () => {
    const next = sinon.stub().resolves('handled');
    await requestBodyBudgetMiddleware(
      givenContext(String(MAX_REQUEST_BODY_BYTES)),
      next,
    );

    sinon.assert.calledOnce(next);
  });

  it('rejects a body one byte over the budget with a 413 and never calls next', async () => {
    const next = sinon.stub().resolves('handled');

    let caught: any = null;
    try {
      await requestBodyBudgetMiddleware(
        givenContext(String(MAX_REQUEST_BODY_BYTES + 1)),
        next,
      );
    } catch (err) {
      caught = err;
    }

    expect(caught).to.not.be.null();
    expect(caught.statusCode).to.equal(413);
    sinon.assert.notCalled(next);
    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.REQUEST_BODY_BYTES,
      }),
    ).to.equal(1);
  });

  it('defers to the body parsers when no length is declared', async () => {
    const next = sinon.stub().resolves('handled');
    await requestBodyBudgetMiddleware(givenContext(), next);
    sinon.assert.calledOnce(next);
  });
});
