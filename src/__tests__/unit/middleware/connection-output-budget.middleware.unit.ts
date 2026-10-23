import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {MiddlewareContext} from '@loopback/rest';
import {
  CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS,
  CONNECTION_OUTPUT_STALL_MS,
  MAX_CONNECTION_BUFFERED_BYTES,
  MAX_TOTAL_PENDING_OUTPUT_BYTES,
} from '../../../config/resource-budgets';
import {
  connectionOutputBudgetMiddleware,
  resetOutputBudgets,
  sweepOutputBudgets,
} from '../../../middleware/connection-output-budget.middleware';
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
      response: {socket, once: sinon.stub()},
    } as unknown as MiddlewareContext,
    destroy,
  };
};

/**
 * A context whose socket buffer changes over the life of the response, and whose
 * `close` handler can be fired on demand.
 */
const givenStreamingContext = (buffered: number[]) => {
  const destroy = sinon.stub();
  const socket = {writableLength: buffered[0] ?? 0, destroy};
  let step = 0;
  const closeHandlers: Array<() => void> = [];
  const ctx = {
    request: {method: 'GET', path: '/tx'},
    response: {
      socket,
      once: (event: string, handler: () => void) => {
        if (event === 'close') closeHandlers.push(handler);
      },
    },
  } as unknown as MiddlewareContext;
  return {
    ctx,
    destroy,
    /** Advances the socket to the next measured value. */
    advance: () => {
      step += 1;
      socket.writableLength = buffered[Math.min(step, buffered.length - 1)];
    },
    close: () => closeHandlers.forEach(h => h()),
  };
};

const violations = () =>
  getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
    resource: ResourceBudgetName.CONNECTION_BUFFERED_BYTES,
  });

describe('Middleware: connection output budget', () => {
  beforeEach(() => {
    resetMetricCounters();
    // The sweeper is process-wide, so a registration left behind by one case is
    // state the next one would inherit.
    resetOutputBudgets();
  });

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

  describe('a peer that stops reading after the response is written', () => {
    /*
     * The case the pre-flight check cannot see, and the one that matters.
     *
     * Sampling once when the request arrives reads a socket that has had nothing
     * written to it yet, so it is always zero. The bytes arrive later, when the
     * response is handed to the socket — and a client that requested a large
     * response and never reads it holds every one of them until the connection
     * closes. Forty-eight such connections exhaust the heap, with nothing
     * oversized fetched and no per-response budget exceeded.
     *
     * Measured, because the discriminator had to be a real one rather than a
     * plausible one: a draining client's `writableLength` stays at 0.00 MB for a
     * 7.5 MB response, and a non-draining client's sits at 7.50 MB from the first
     * sample onwards. The two are not close, which is what makes sampling work.
     */
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      // Only `Date.now` matters here: the sweeper is driven explicitly, because
      // it is created at module load and a fake installed afterwards would never
      // own its timer.
      clock = sinon.useFakeTimers();
    });

    afterEach(() => clock.restore());

    /** Advances the clock and runs the sweeper, the way the interval would. */
    const sweepFor = async (ms: number) => {
      const steps = Math.max(1, Math.round(ms / CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS));
      for (let i = 0; i < steps; i += 1) {
        await clock.tickAsync(CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS);
        sweepOutputBudgets();
      }
    };

    const OVER = MAX_CONNECTION_BUFFERED_BYTES * 4;

    it('drops a connection whose buffer stays over the budget', async () => {
      const {ctx, destroy, advance} = givenStreamingContext([0, OVER, OVER, OVER]);
      await connectionOutputBudgetMiddleware(ctx, sinon.stub().resolves(''));

      // The response is written after the middleware returns, so the buffer only
      // appears now — and then never moves, which is what a peer that has
      // stopped reading looks like.
      advance();
      await sweepFor(CONNECTION_OUTPUT_STALL_MS + CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS * 2);

      sinon.assert.called(destroy);
      expect(violations()).to.equal(1);
    });

    it('leaves a slow but draining peer alone', async () => {
      // The false positive that would break `GET /tx` for large transactions.
      // Over the budget, but going down every sample: the peer is reading, just
      // not quickly. Dropping it would be the control causing the outage.
      // Arrives with an empty socket, like every request does — the buffer only
      // appears when the response is written.
      const {ctx, destroy, advance} = givenStreamingContext([
        0,
        OVER,
        OVER * 0.75,
        OVER * 0.5,
        OVER * 0.25,
      ]);
      await connectionOutputBudgetMiddleware(ctx, sinon.stub().resolves(''));

      // Draining, slowly: every sample is lower than the last, spread over more
      // than the stall window so a level-based rule would have dropped it.
      for (let i = 0; i < 5; i += 1) {
        advance();
        await sweepFor(CONNECTION_OUTPUT_STALL_MS / 2);
      }

      sinon.assert.notCalled(destroy);
      expect(violations()).to.equal(0);
    });

    it('does not drop a response that is only briefly over budget', async () => {
      // A large legitimate response is over the budget by definition for as long
      // as it takes to go out — measured at up to 70 ms under load. Dropping on
      // sight would refuse every transaction worth more than a megabyte.
      const {ctx, destroy, advance} = givenStreamingContext([0, OVER]);
      await connectionOutputBudgetMiddleware(ctx, sinon.stub().resolves(''));

      advance();
      await sweepFor(CONNECTION_OUTPUT_STALL_MS / 2);

      sinon.assert.notCalled(destroy);
    });

    it('leaves a peer under the budget alone however long it takes', async () => {
      const {ctx, destroy} = givenStreamingContext([
        MAX_CONNECTION_BUFFERED_BYTES,
      ]);
      await connectionOutputBudgetMiddleware(ctx, sinon.stub().resolves(''));

      await sweepFor(CONNECTION_OUTPUT_STALL_MS * 10);

      sinon.assert.notCalled(destroy);
      expect(violations()).to.equal(0);
    });

    it('stops sampling once the response closes', async () => {
      // A timer per in-flight response, so it has to end with the response.
      const {ctx, destroy, advance, close} = givenStreamingContext([0, OVER, OVER]);
      await connectionOutputBudgetMiddleware(ctx, sinon.stub().resolves(''));

      close();
      advance();
      await sweepFor(CONNECTION_OUTPUT_STALL_MS * 10);

      sinon.assert.notCalled(destroy);
    });
  });

  describe('the ceiling no single connection can see', () => {
    /*
     * The quantity that kills the process is the sum across connections, and each
     * one on its own looks unremarkable — well inside its stall allowance, one
     * large response in flight. Only the total has gone wrong.
     *
     * It counts *stuck* bytes rather than all pending bytes, and that filter is
     * what makes a low ceiling safe. Measured across 48 concurrent 7.5 MB
     * responses: legitimate clients hold 60 MB pending at peak against 90 MB for
     * a burst, which is not separable — but 0 MB stuck against 30 MB, which is.
     */
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = sinon.useFakeTimers();
    });

    afterEach(() => clock.restore());

    /** Registers `count` responses each holding `bytes`, and returns their destroy stubs. */
    const givenStuckConnections = async (count: number, bytes: number) => {
      const entries = Array.from({length: count}, () =>
        givenStreamingContext([0, bytes, bytes, bytes]),
      );
      for (const e of entries) {
        await connectionOutputBudgetMiddleware(e.ctx, sinon.stub().resolves(''));
      }
      entries.forEach(e => e.advance());
      return entries;
    };

    /** Enough to qualify as stuck, but far inside the per-connection allowance. */
    const untilQualified = async () => {
      for (let i = 0; i < 6; i += 1) {
        await clock.tickAsync(CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS);
        sweepOutputBudgets();
      }
    };

    it('drops stuck connections once their total passes the ceiling', async () => {
      // Three responses of half the ceiling each: every one is inside its stall
      // allowance, and together they are over.
      const entries = await givenStuckConnections(
        3,
        MAX_TOTAL_PENDING_OUTPUT_BYTES * 0.6,
      );

      await untilQualified();

      const dropped = entries.filter(e => e.destroy.called).length;
      expect(dropped).to.be.greaterThan(0);
      expect(violations()).to.be.greaterThan(0);
    });

    it('drops the heaviest holder first', async () => {
      // Frees the most memory per connection sacrificed, and targets the client
      // doing the most damage rather than whichever was sampled first.
      const small = givenStreamingContext([0, MAX_CONNECTION_BUFFERED_BYTES * 2]);
      const huge = givenStreamingContext([0, MAX_TOTAL_PENDING_OUTPUT_BYTES * 2]);
      for (const e of [small, huge]) {
        await connectionOutputBudgetMiddleware(e.ctx, sinon.stub().resolves(''));
      }
      small.advance();
      huge.advance();

      await untilQualified();

      sinon.assert.called(huge.destroy);
      sinon.assert.notCalled(small.destroy);
    });

    it('leaves connections alone before they have been stuck long enough', async () => {
      // The filter that keeps the ceiling off legitimate traffic: a large answer
      // on its way out is pending too, and must not count.
      const entries = await givenStuckConnections(
        4,
        MAX_TOTAL_PENDING_OUTPUT_BYTES,
      );

      await clock.tickAsync(CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS);
      sweepOutputBudgets();

      entries.forEach(e => sinon.assert.notCalled(e.destroy));
    });

    it('leaves a total under the ceiling alone indefinitely', async () => {
      const entries = await givenStuckConnections(
        2,
        MAX_CONNECTION_BUFFERED_BYTES * 1.5,
      );

      await untilQualified();

      entries.forEach(e => sinon.assert.notCalled(e.destroy));
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
