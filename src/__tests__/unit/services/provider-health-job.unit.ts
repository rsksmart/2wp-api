import {expect, sinon} from '@loopback/testlab';
import {RESOURCE_BUDGET_DEFAULTS} from '../../../config/resource-budgets';
import {
  PROVIDER_HEALTH_CHECK_TIMEOUT_MS,
  ProviderCheckFailure,
  ProviderHealthCheck,
  ProviderHealthJob,
  ProviderHealthStore,
} from '../../../services/provider-health';

/** A provider check whose next answer the test decides. */
class FakeCheck implements ProviderHealthCheck {
  calls = 0;
  answer: () => Promise<void> = () => Promise.resolve();

  constructor(readonly provider: string) {}

  check(): Promise<void> {
    this.calls += 1;
    return this.answer();
  }
}

const refused = () =>
  Promise.reject(
    Object.assign(new Error('connect ECONNREFUSED'), {code: 'ECONNREFUSED'}),
  );
const never = () => new Promise<void>(() => {});

/** A job with its logger silenced, so test output shows only results. */
function makeJob(
  checks: ProviderHealthCheck[],
  store: ProviderHealthStore,
  intervalMs = 30_000,
): ProviderHealthJob {
  const job = new ProviderHealthJob(checks, store, {intervalMs, timeoutMs: 50});
  sinon.stub(job.logger, 'info');
  sinon.stub(job.logger, 'warn');
  sinon.stub(job.logger, 'error');
  return job;
}

describe('Provider health: background job', () => {
  let store: ProviderHealthStore;
  let powpeg: FakeCheck;
  let job: ProviderHealthJob;

  beforeEach(() => {
    store = new ProviderHealthStore();
    powpeg = new FakeCheck('powpeg');
    job = makeJob([powpeg], store);
  });

  afterEach(() => {
    job.stop();
    sinon.restore();
  });

  describe('one round', () => {
    it('stores a passing provider as up', async () => {
      await job.runRound();

      expect(store.get('powpeg')).to.containDeep({status: 'up', reason: null});
    });

    it('stores a failing provider as down, with the reason code', async () => {
      powpeg.answer = refused;

      await job.runRound();

      expect(store.get('powpeg')).to.containDeep({status: 'down', reason: 'refused'});
    });

    it('keeps the reason a check gives itself', async () => {
      powpeg.answer = () =>
        Promise.reject(new ProviderCheckFailure('no_capacity', 'full'));

      await job.runRound();

      expect(store.get('powpeg')!.reason).to.equal('no_capacity');
    });

    it('counts a check over the time limit as a timeout', async () => {
      powpeg.answer = never;

      await job.runRound();

      const result = store.get('powpeg')!;
      expect(result).to.containDeep({status: 'down', reason: 'timeout'});
      expect(result.durationMs).to.be.greaterThanOrEqual(45);
    });

    it('records when the check ended and how long it took', async () => {
      const before = Date.now();

      await job.runRound();

      const result = store.get('powpeg')!;
      expect(result.checkedAt.getTime()).to.be.within(before, Date.now());
      expect(result.durationMs).to.be.within(0, Date.now() - before);
    });

    it('checks every provider, and one failure does not touch the others', async () => {
      const other = new FakeCheck('flyover-lp-1');
      other.answer = refused;
      job = makeJob([powpeg, other], store);

      await job.runRound();

      expect(store.get('powpeg')!.status).to.equal('up');
      expect(store.get('flyover-lp-1')!.status).to.equal('down');
    });

    it('does not start a second round while one is running', async () => {
      powpeg.answer = never;

      await Promise.all([job.runRound(), job.runRound()]);

      expect(powpeg.calls).to.equal(1);
    });
  });

  describe('status over several rounds', () => {
    it('goes down on the third failure in a row and up on the second pass', async () => {
      const statuses: string[] = [];
      const answers = [undefined, refused, refused, refused, undefined, undefined];
      for (const answer of answers) {
        powpeg.answer = answer ?? (() => Promise.resolve());
        // eslint-disable-next-line no-await-in-loop
        await job.runRound();
        statuses.push(store.get('powpeg')!.status);
      }

      expect(statuses).to.deepEqual(['up', 'up', 'up', 'down', 'down', 'up']);
    });

    it('logs a change once, not every check', async () => {
      const warn = job.logger.warn as unknown as sinon.SinonStub;
      const info = job.logger.info as unknown as sinon.SinonStub;
      powpeg.answer = refused;

      await job.runRound();
      await job.runRound();
      powpeg.answer = () => Promise.resolve();
      await job.runRound();
      await job.runRound();
      await job.runRound();

      expect(warn.callCount).to.equal(1);
      expect(warn.firstCall.args[0]).to.containDeep({
        event: 'provider_down',
        provider: 'powpeg',
        reason: 'refused',
      });
      expect(info.callCount).to.equal(1);
      expect(info.firstCall.args[0]).to.containDeep({
        event: 'provider_up',
        provider: 'powpeg',
      });
    });
  });

  describe('timer', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
      clock = sinon.useFakeTimers({toFake: ['setInterval', 'clearInterval']});
    });

    afterEach(() => {
      clock.restore();
    });

    it('runs a round at once, then one every interval', async () => {
      job.start();
      await clock.tickAsync(0);
      expect(powpeg.calls).to.equal(1);

      await clock.tickAsync(30_000);
      expect(powpeg.calls).to.equal(2);

      await clock.tickAsync(30_000);
      expect(powpeg.calls).to.equal(3);
    });

    it('runs nothing after it stops', async () => {
      job.start();
      await clock.tickAsync(0);
      job.stop();

      await clock.tickAsync(90_000);

      expect(powpeg.calls).to.equal(1);
    });

    it('starts only once', async () => {
      job.start();
      job.start();

      await clock.tickAsync(30_000);

      expect(powpeg.calls).to.equal(2);
    });

    it('uses the default interval when the configured one is below the time limit', async () => {
      const fallbackMs = RESOURCE_BUDGET_DEFAULTS.PROVIDER_HEALTH_CHECK_INTERVAL_MS;
      expect(fallbackMs).to.be.greaterThanOrEqual(PROVIDER_HEALTH_CHECK_TIMEOUT_MS);
      job = makeJob([powpeg], store, 49); // makeJob sets a 50 ms time limit

      job.start();
      await clock.tickAsync(fallbackMs - 1);
      expect(powpeg.calls).to.equal(1);
      await clock.tickAsync(1);
      expect(powpeg.calls).to.equal(2);
      sinon.assert.calledOnceWithMatch(job.logger.warn as sinon.SinonStub, {
        event: 'provider_health_interval_too_short',
        configuredMs: 49,
        intervalMs: fallbackMs,
      });
    });

    it('keeps an interval equal to the time limit', async () => {
      job = makeJob([powpeg], store, 50);

      job.start();
      await clock.tickAsync(50);

      expect(powpeg.calls).to.equal(2);
      sinon.assert.notCalled(job.logger.warn as sinon.SinonStub);
    });

    it('runs nothing when the interval is 0', async () => {
      job = makeJob([powpeg], store, 0);

      job.start();
      await clock.tickAsync(90_000);

      expect(powpeg.calls).to.equal(0);
      expect(store.list()).to.deepEqual([]);
    });
  });
});
