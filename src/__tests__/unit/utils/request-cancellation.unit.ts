import {expect} from '@loopback/testlab';
import {
  getMetricCounter,
  getMetricCounters,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  cancellationOf,
  CLIENT_CLOSED_REQUEST_STATUS,
  recordCancellation,
  REQUEST_CANCELLED_METRIC,
  RequestCancelledError,
  throwIfCancelled,
} from '../../../utils/request-cancellation';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';
import {runWithRequestContext} from '../../../utils/trace-context';

describe('Utils: request cancellation', () => {
  beforeEach(resetMetricCounters);

  const cancelled = (reason: string) =>
    getMetricCounter(REQUEST_CANCELLED_METRIC, {reason});

  describe('throwIfCancelled', () => {
    it('does nothing outside a request context', () => {
      // The daemon shares the same providers and is never cancelled.
      expect(() => throwIfCancelled()).to.not.throw();
    });

    it('does nothing while the request is live', () => {
      const controller = new AbortController();

      runWithRequestContext({traceId: 't', signal: controller.signal}, () => {
        expect(() => throwIfCancelled()).to.not.throw();
      });
    });

    it('throws once the request is cancelled', () => {
      const controller = new AbortController();
      controller.abort();

      runWithRequestContext({traceId: 't', signal: controller.signal}, () => {
        expect(() => throwIfCancelled()).to.throw(RequestCancelledError);
      });
    });
  });

  describe('observability', () => {
    it('counts a client abort', () => {
      recordCancellation({reason: 'client_aborted', route: 'POST /utxo', elapsedMs: 12});

      expect(cancelled('client_aborted')).to.equal(1);
      expect(cancelled('timeout')).to.equal(0);
    });

    it('counts a deadline breach and records it as a budget violation', () => {
      recordCancellation({
        reason: 'timeout',
        route: 'POST /utxo',
        elapsedMs: 30001,
        configuredLimitMs: 30000,
      });

      expect(cancelled('timeout')).to.equal(1);
      // A deadline IS a configured ceiling, so it belongs on both signals.
      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.REQUEST_DURATION_MS,
        }),
      ).to.equal(1);
    });

    it('does not record a budget violation for a client abort', () => {
      // A client that leaves has not exceeded anything we configured.
      recordCancellation({reason: 'client_aborted', route: 'POST /utxo', elapsedMs: 5});

      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.REQUEST_DURATION_MS,
        }),
      ).to.equal(0);
    });

    it('keeps the label vocabulary closed', () => {
      recordCancellation({reason: 'client_aborted', route: 'POST /utxo', elapsedMs: 1});
      recordCancellation({reason: 'timeout', route: 'POST /utxo', elapsedMs: 2});

      Object.keys(getMetricCounters())
        .filter(k => k.startsWith(REQUEST_CANCELLED_METRIC))
        .forEach(key => {
          expect(key).to.match(
            /^request_cancelled_total\{reason="(client_aborted|timeout)"\}$/,
          );
        });
    });
  });

  describe('the reason survives the signal', () => {
    it('carries the reason the middleware aborted with', () => {
      const controller = new AbortController();
      controller.abort(new RequestCancelledError('timeout'));

      // Without this, every consumer would report the default reason and a
      // deadline breach would surface as a client abort.
      expect(cancellationOf(controller.signal)?.reason).to.equal('timeout');
      expect(cancellationOf(controller.signal)?.statusCode).to.equal(503);
    });

    it('still yields a usable error when aborted without a reason', () => {
      const controller = new AbortController();
      controller.abort();

      expect(cancellationOf(controller.signal)).to.be.instanceOf(RequestCancelledError);
      expect(cancellationOf(controller.signal)?.reason).to.equal('client_aborted');
    });

    it('reports nothing for a live or absent signal', () => {
      expect(cancellationOf(new AbortController().signal)).to.be.undefined();
      expect(cancellationOf(undefined)).to.be.undefined();
    });

    it('propagates the reason through throwIfCancelled', () => {
      const controller = new AbortController();
      controller.abort(new RequestCancelledError('timeout'));

      runWithRequestContext({traceId: 't', signal: controller.signal}, () => {
        let caught: any = null;
        try {
          throwIfCancelled();
        } catch (err) {
          caught = err;
        }
        expect(caught.reason).to.equal('timeout');
        expect(caught.statusCode).to.equal(503);
      });
    });
  });

  describe('status carried by the error', () => {
    it('reports a client abort as 499', () => {
      expect(new RequestCancelledError('client_aborted').statusCode).to.equal(
        CLIENT_CLOSED_REQUEST_STATUS,
      );
    });

    it('reports a deadline breach as 503', () => {
      expect(new RequestCancelledError('timeout').statusCode).to.equal(503);
    });

    it('defaults to the client-abort status', () => {
      expect(new RequestCancelledError().statusCode).to.equal(
        CLIENT_CLOSED_REQUEST_STATUS,
      );
    });
  });
});
