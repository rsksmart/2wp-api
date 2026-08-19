import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {MiddlewareContext} from '@loopback/rest';
import {MAX_CONNECTION_BUFFERED_BYTES} from '../../../config/resource-budgets';
import {connectionOutputBudgetMiddleware} from '../../../middleware/connection-output-budget.middleware';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

/** A context whose response socket reports `writableLength` bytes buffered. */
const givenContext = (writableLength?: number) => {
  const destroy = sinon.stub();
  const socket = writableLength === undefined ? undefined : {writableLength, destroy};
  return {
    ctx: {
      request: {method: 'POST', path: '/utxo'},
      response: {socket},
    } as unknown as MiddlewareContext,
    destroy,
  };
};

const violations = () =>
  getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
    resource: ResourceBudgetName.CONNECTION_BUFFERED_BYTES,
  });

describe('Middleware: connection output budget', () => {
  beforeEach(resetMetricCounters);

  describe('a peer that is keeping up', () => {
    it('passes a connection with nothing buffered through', async () => {
      const {ctx, destroy} = givenContext(0);
      const next = sinon.stub().resolves('handled');

      expect(await connectionOutputBudgetMiddleware(ctx, next)).to.equal('handled');
      sinon.assert.notCalled(destroy);
    });

    it('passes a connection buffered just below the budget through', async () => {
      const {ctx, destroy} = givenContext(MAX_CONNECTION_BUFFERED_BYTES - 1);
      const next = sinon.stub().resolves('handled');

      await connectionOutputBudgetMiddleware(ctx, next);
      sinon.assert.calledOnce(next);
      sinon.assert.notCalled(destroy);
    });

    it('passes a connection buffered exactly at the budget through', async () => {
      const {ctx, destroy} = givenContext(MAX_CONNECTION_BUFFERED_BYTES);
      const next = sinon.stub().resolves('handled');

      await connectionOutputBudgetMiddleware(ctx, next);
      sinon.assert.calledOnce(next);
      sinon.assert.notCalled(destroy);
      expect(violations()).to.equal(0);
    });
  });

  describe('a peer that has stopped reading', () => {
    it('drops a connection one byte over the budget and never calls next', async () => {
      const {ctx, destroy} = givenContext(MAX_CONNECTION_BUFFERED_BYTES + 1);
      const next = sinon.stub().resolves('handled');

      await connectionOutputBudgetMiddleware(ctx, next);

      sinon.assert.calledOnce(destroy);
      sinon.assert.notCalled(next);
      expect(violations()).to.equal(1);
    });

    it('records the observed buffer size, not the payload', async () => {
      const {ctx} = givenContext(MAX_CONNECTION_BUFFERED_BYTES * 4);
      await connectionOutputBudgetMiddleware(ctx, sinon.stub().resolves(''));

      expect(violations()).to.equal(1);
    });
  });

  describe('degenerate sockets', () => {
    it('proceeds when the response has no socket', async () => {
      const {ctx} = givenContext(undefined);
      const next = sinon.stub().resolves('handled');

      await connectionOutputBudgetMiddleware(ctx, next);
      sinon.assert.calledOnce(next);
      expect(violations()).to.equal(0);
    });
  });
});
