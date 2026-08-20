import {expect} from '@loopback/testlab';
import {
  getRequestSignal,
  getTraceId,
  runWithRequestContext,
  runWithTraceId,
} from '../../../utils/trace-context';

describe('Utils: request context', () => {
  describe('traceId', () => {
    it('exposes the traceId inside the context', () => {
      runWithTraceId('abc123', () => {
        expect(getTraceId()).to.equal('abc123');
      });
    });

    it('has no traceId outside a context', () => {
      expect(getTraceId()).to.be.undefined();
    });
  });

  describe('cancellation signal', () => {
    it('exposes the signal inside the context', () => {
      const controller = new AbortController();

      runWithRequestContext({traceId: 'abc', signal: controller.signal}, () => {
        expect(getRequestSignal()).to.equal(controller.signal);
      });
    });

    it('survives an await boundary', async () => {
      const controller = new AbortController();

      await runWithRequestContext(
        {traceId: 'abc', signal: controller.signal},
        async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          // The provider fan-out awaits between batches, so the signal has to
          // outlive a tick or it is useless where it matters.
          expect(getRequestSignal()).to.equal(controller.signal);
        },
      );
    });

    it('reflects the abort after the fact', () => {
      const controller = new AbortController();

      runWithRequestContext({traceId: 'abc', signal: controller.signal}, () => {
        expect(getRequestSignal()?.aborted).to.be.false();
        controller.abort();
        expect(getRequestSignal()?.aborted).to.be.true();
      });
    });

    // The daemon calls the same providers with no request behind them, so every
    // consumer has to tolerate the signal being absent.
    it('has no signal outside a request context', () => {
      expect(getRequestSignal()).to.be.undefined();
    });

    it('has no signal when only a traceId was established', () => {
      runWithTraceId('abc', () => {
        expect(getRequestSignal()).to.be.undefined();
      });
    });

    it('does not leak between sibling contexts', () => {
      const a = new AbortController();
      const b = new AbortController();

      runWithRequestContext({traceId: 'a', signal: a.signal}, () => {
        runWithRequestContext({traceId: 'b', signal: b.signal}, () => {
          expect(getRequestSignal()).to.equal(b.signal);
        });
        expect(getRequestSignal()).to.equal(a.signal);
      });
    });
  });
});
