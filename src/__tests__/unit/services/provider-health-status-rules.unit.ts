import {expect} from '@loopback/testlab';
import {
  applyCheck,
  CheckOutcome,
  HealthFailureReason,
  ProviderHealthResult,
} from '../../../services/provider-health';

const START = Date.parse('2026-11-08T10:00:00Z');

/** The outcome of check number `n`, one check every 30 s from START. */
function outcome(n: number, reason: HealthFailureReason | null): CheckOutcome {
  return {reason, durationMs: 100 + n, checkedAt: new Date(START + n * 30_000)};
}

/** Runs checks in order: `null` passes, a reason fails. Returns every result. */
function run(
  reasons: (HealthFailureReason | null)[],
  previous?: ProviderHealthResult,
): ProviderHealthResult[] {
  const results: ProviderHealthResult[] = [];
  reasons.reduce<ProviderHealthResult | undefined>((last, reason, n) => {
    const next = applyCheck(last, outcome(n, reason));
    results.push(next);
    return next;
  }, previous);
  return results;
}

describe('Provider health: status rules', () => {
  describe('first check', () => {
    it('sets up directly', () => {
      const [first] = run([null]);

      expect(first).to.deepEqual({
        status: 'up',
        since: outcome(0, null).checkedAt,
        reason: null,
        durationMs: 100,
        checkedAt: outcome(0, null).checkedAt,
        opposingStreak: 0,
      });
    });

    it('sets down directly, so a provider dead at startup is reported at once', () => {
      const [first] = run(['refused']);

      expect(first.status).to.equal('down');
      expect(first.reason).to.equal('refused');
      expect(first.since).to.deepEqual(outcome(0, null).checkedAt);
    });
  });

  describe('going down', () => {
    it('stays up through two failures and goes down on the third', () => {
      const results = run([null, 'timeout', 'timeout', 'timeout']);

      expect(results.map(r => r.status)).to.deepEqual(['up', 'up', 'up', 'down']);
      expect(results.map(r => r.opposingStreak)).to.deepEqual([0, 1, 2, 0]);
    });

    it('reports no reason while still up', () => {
      const results = run([null, 'timeout', 'timeout']);

      expect(results.map(r => r.reason)).to.deepEqual([null, null, null]);
    });

    it('dates the change from the third failure, with its reason', () => {
      const down = run([null, 'timeout', 'refused', 'http_5xx'])[3];

      expect(down.since).to.deepEqual(outcome(3, null).checkedAt);
      expect(down.reason).to.equal('http_5xx');
    });

    it('starts counting again after a pass', () => {
      const results = run([null, 'timeout', 'timeout', null, 'timeout', 'timeout']);

      expect(results.every(r => r.status === 'up')).to.be.true();
      expect(results[5].since).to.deepEqual(outcome(0, null).checkedAt);
    });
  });

  describe('coming back up', () => {
    const down = run(['no_capacity'])[0];

    it('stays down after one pass and keeps the reason it went down', () => {
      const [recovering] = run([null], down);

      expect(recovering.status).to.equal('down');
      expect(recovering.reason).to.equal('no_capacity');
      expect(recovering.opposingStreak).to.equal(1);
    });

    it('goes up on the second pass and clears the reason', () => {
      const [, up] = run([null, null], down);

      expect(up.status).to.equal('up');
      expect(up.reason).to.be.null();
      expect(up.since).to.deepEqual(outcome(1, null).checkedAt);
      expect(up.opposingStreak).to.equal(0);
    });

    it('starts counting again after a failure', () => {
      const results = run([null, 'timeout', null], down);

      expect(results.map(r => r.status)).to.deepEqual(['down', 'down', 'down']);
      expect(results[2].since).to.deepEqual(down.since);
    });

    it('updates the reason when a down provider fails differently', () => {
      const [stillDown] = run(['refused'], down);

      expect(stillDown.reason).to.equal('refused');
      expect(stillDown.since).to.deepEqual(down.since);
    });
  });

  it('always records the latest duration and check time', () => {
    const results = run([null, 'timeout', 'timeout', 'timeout', null]);

    results.forEach((result, n) => {
      expect(result.durationMs).to.equal(100 + n);
      expect(result.checkedAt).to.deepEqual(outcome(n, null).checkedAt);
    });
  });
});
