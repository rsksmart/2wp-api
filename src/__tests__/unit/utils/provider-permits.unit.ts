import {expect} from '@loopback/testlab';
import {
  getMetricCounter,
  getMetricGauge,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  PermitRejectedError,
  PROVIDER_PERMITS_ACTIVE_GAUGE,
  PROVIDER_PERMITS_QUEUED_GAUGE,
  PROVIDER_PERMITS_REJECTED_METRIC,
  Semaphore,
} from '../../../utils/provider-permits';
import {RequestCancelledError} from '../../../utils/request-cancellation';
import {runWithRequestContext} from '../../../utils/trace-context';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const givenSemaphore = (
  over: Partial<{limit: number; queueDepth: number; waitMs: number}> = {},
) =>
  new Semaphore({
    name: 'test',
    limit: 2,
    queueDepth: 10,
    waitMs: 1000,
    ...over,
  });

describe('Utils: provider permits', () => {
  beforeEach(resetMetricCounters);

  describe('the limit actually holds', () => {
    it('never runs more than `limit` callers at once', async () => {
      const sem = givenSemaphore({limit: 3, queueDepth: 30});
      let active = 0;
      let peak = 0;

      await Promise.all(
        Array.from({length: 30}, () =>
          sem.run(async () => {
            active += 1;
            peak = Math.max(peak, active);
            await delay(5);
            active -= 1;
          }),
        ),
      );

      expect(peak).to.equal(3);
      expect(active).to.equal(0);
    });

    it('releases the permit when the caller throws', async () => {
      const sem = givenSemaphore({limit: 1});

      await expect(
        sem.run(async () => {
          throw new Error('boom');
        }),
      ).to.be.rejectedWith('boom');

      // A permit leaked on the error path degrades into a total outage, which
      // is worse than the problem being solved.
      expect(sem.active).to.equal(0);
      await expect(sem.run(async () => 'ok')).to.be.fulfilled();
    });

    it('grants permits in the order they were requested', async () => {
      const sem = givenSemaphore({limit: 1});
      const order: number[] = [];
      const started = sem.run(() => delay(30));
      const queued = [1, 2, 3].map(n =>
        sem.run(async () => {
          order.push(n);
        }),
      );

      await Promise.all([started, ...queued]);

      expect(order).to.deepEqual([1, 2, 3]);
    });
  });

  describe('the queue is bounded', () => {
    it('rejects once the queue is full', async () => {
      const sem = givenSemaphore({limit: 1, queueDepth: 2});
      const held = sem.run(() => delay(50));
      const queued = [sem.run(async () => 'a'), sem.run(async () => 'b')];

      // Third waiter has nowhere to sit.
      await expect(sem.run(async () => 'c')).to.be.rejectedWith(
        PermitRejectedError,
      );

      await Promise.all([held, ...queued]);
      expect(
        getMetricCounter(PROVIDER_PERMITS_REJECTED_METRIC, {
          pool: 'test',
          reason: 'queue_full',
        }),
      ).to.equal(1);
    });

    it('rejects once the wait budget expires', async () => {
      const sem = givenSemaphore({limit: 1, waitMs: 30});
      const held = sem.run(() => delay(300));

      await expect(sem.run(async () => 'late')).to.be.rejectedWith(
        PermitRejectedError,
      );
      expect(
        getMetricCounter(PROVIDER_PERMITS_REJECTED_METRIC, {
          pool: 'test',
          reason: 'wait_timeout',
        }),
      ).to.equal(1);

      await held;
      expect(sem.active).to.equal(0);
      expect(sem.queued).to.equal(0);
    });

    it('reports overload as a retryable 503', () => {
      const err = new PermitRejectedError('test', 'queue_full');

      expect(err.statusCode).to.equal(503);
      expect(err.retryAfterSeconds).to.be.greaterThan(0);
    });
  });

  describe('waiting is cancellation-aware', () => {
    it('drops a waiter whose client has gone, without consuming a permit', async () => {
      const sem = givenSemaphore({limit: 1, waitMs: 5000});
      let ranAfterCancel = false;
      const held = sem.run(() => delay(80));
      const controller = new AbortController();

      const cancelled = runWithRequestContext(
        {traceId: 't', signal: controller.signal},
        () =>
          sem.run(async () => {
            ranAfterCancel = true;
          }),
      );
      await delay(10);
      expect(sem.queued).to.equal(1);
      controller.abort(new RequestCancelledError('client_aborted'));

      await expect(cancelled).to.be.rejectedWith(RequestCancelledError);
      // The whole point: abandoned work never reaches the provider.
      expect(ranAfterCancel).to.be.false();
      expect(sem.queued).to.equal(0);

      await held;
      expect(sem.active).to.equal(0);
    });

    it('refuses immediately when the signal is already aborted', async () => {
      const sem = givenSemaphore({limit: 5});
      const controller = new AbortController();
      controller.abort(new RequestCancelledError('timeout'));
      let ran = false;

      await expect(
        runWithRequestContext({traceId: 't', signal: controller.signal}, () =>
          sem.run(async () => {
            ran = true;
          }),
        ),
      ).to.be.rejectedWith(RequestCancelledError);

      expect(ran).to.be.false();
      expect(sem.active).to.equal(0);
    });

    it('does not leak a permit when cancelled at the moment it is granted', async () => {
      const sem = givenSemaphore({limit: 1});
      const controller = new AbortController();
      const held = sem.run(() => delay(40));

      const racing = runWithRequestContext(
        {traceId: 't', signal: controller.signal},
        () => sem.run(async () => delay(5)),
      );
      // Abort exactly as the holder releases, so the waiter is being granted.
      setTimeout(() => controller.abort(new RequestCancelledError()), 40);

      await Promise.allSettled([held, racing]);
      await delay(60);

      expect(sem.active).to.equal(0);
      expect(sem.queued).to.equal(0);
      await expect(sem.run(async () => 'still works')).to.be.fulfilled();
    });

    it('never cancels work with no request behind it', async () => {
      // The daemon shares these helpers and has no signal.
      const sem = givenSemaphore({limit: 1});

      expect(await sem.run(async () => 'daemon work')).to.equal('daemon work');
      expect(sem.active).to.equal(0);
    });
  });

  describe('observability', () => {
    it('reports active and queued as gauges that return to zero', async () => {
      const sem = givenSemaphore({limit: 1});
      const held = sem.run(() => delay(40));
      const queued = sem.run(async () => 'q');
      await delay(10);

      expect(
        getMetricGauge(PROVIDER_PERMITS_ACTIVE_GAUGE, {pool: 'test'}),
      ).to.equal(1);
      expect(
        getMetricGauge(PROVIDER_PERMITS_QUEUED_GAUGE, {pool: 'test'}),
      ).to.equal(1);

      await Promise.all([held, queued]);

      expect(
        getMetricGauge(PROVIDER_PERMITS_ACTIVE_GAUGE, {pool: 'test'}),
      ).to.equal(0);
      expect(
        getMetricGauge(PROVIDER_PERMITS_QUEUED_GAUGE, {pool: 'test'}),
      ).to.equal(0);
    });

    it('records how long callers waited', async () => {
      const sem = givenSemaphore({limit: 1});
      const held = sem.run(() => delay(40));
      await Promise.all([held, sem.run(async () => 'q')]);

      expect(sem.waitStats.count).to.be.greaterThanOrEqual(1);
      expect(sem.waitStats.max).to.be.greaterThan(0);
    });
  });
});
