import {expect} from '@loopback/testlab';
import {getLogger} from '../../../utils/logger';
import {
  adjustMetricGauge,
  getMetricCounter,
  getMetricGauge,
  getMetricGauges,
  incrementMetricCounter,
  resetMetricCounters,
  setMetricGauge,
} from '../../../utils/metric-logger';

const logger = getLogger('metric-logger-test');
const GAUGE = 'test_gauge';

describe('Utils: metric logger', () => {
  beforeEach(() => {
    resetMetricCounters();
  });

  after(() => {
    resetMetricCounters();
  });

  describe('gauges', () => {
    it('reads as zero before it is ever set', () => {
      expect(getMetricGauge(GAUGE)).to.equal(0);
    });

    it('moves in both directions', () => {
      adjustMetricGauge(logger, GAUGE, 3);
      expect(getMetricGauge(GAUGE)).to.equal(3);

      adjustMetricGauge(logger, GAUGE, -2);
      expect(getMetricGauge(GAUGE)).to.equal(1);
    });

    it('never goes below zero', () => {
      adjustMetricGauge(logger, GAUGE, 1);

      adjustMetricGauge(logger, GAUGE, -5);

      // A negative "how many are in flight" would be a corrupted signal rather
      // than a visibly stuck one.
      expect(getMetricGauge(GAUGE)).to.equal(0);
    });

    it('recovers after being clamped', () => {
      adjustMetricGauge(logger, GAUGE, -5);
      adjustMetricGauge(logger, GAUGE, 2);

      expect(getMetricGauge(GAUGE)).to.equal(2);
    });

    it('can be set absolutely', () => {
      adjustMetricGauge(logger, GAUGE, 7);

      setMetricGauge(logger, GAUGE, 2);

      expect(getMetricGauge(GAUGE)).to.equal(2);
    });

    it('keeps label sets apart', () => {
      adjustMetricGauge(logger, GAUGE, 1, {pool: 'a'});
      adjustMetricGauge(logger, GAUGE, 4, {pool: 'b'});

      expect(getMetricGauge(GAUGE, {pool: 'a'})).to.equal(1);
      expect(getMetricGauge(GAUGE, {pool: 'b'})).to.equal(4);
      expect(getMetricGauge(GAUGE)).to.equal(0);
    });

    it('treats label order as insignificant', () => {
      adjustMetricGauge(logger, GAUGE, 1, {pool: 'a', reason: 'x'});

      expect(getMetricGauge(GAUGE, {reason: 'x', pool: 'a'})).to.equal(1);
    });

    it('keys gauges the same way counters are keyed', () => {
      adjustMetricGauge(logger, GAUGE, 2, {pool: 'a'});

      expect(getMetricGauges()).to.deepEqual({'test_gauge{pool="a"}': 2});
    });
  });

  describe('gauges and counters are separate registries', () => {
    it('does not let a gauge overwrite a counter of the same name', () => {
      incrementMetricCounter(logger, 'shared_name');
      setMetricGauge(logger, 'shared_name', 99);

      // A counter that a gauge could overwrite would silently lose its
      // monotonicity, which is the one property alerting relies on.
      expect(getMetricCounter('shared_name')).to.equal(1);
      expect(getMetricGauge('shared_name')).to.equal(99);
    });

    it('clears both on reset', () => {
      incrementMetricCounter(logger, 'shared_name');
      setMetricGauge(logger, GAUGE, 5);

      resetMetricCounters();

      expect(getMetricCounter('shared_name')).to.equal(0);
      expect(getMetricGauge(GAUGE)).to.equal(0);
    });
  });
});
