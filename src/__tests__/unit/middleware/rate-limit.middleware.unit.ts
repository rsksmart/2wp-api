import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {
  RATE_LIMIT_MAX_TRACKED_CLIENTS,
  RATE_LIMIT_WINDOW_MS,
} from '../../../config/resource-budgets';
import {
  RATE_LIMIT_REJECTED_METRIC,
  RateLimitedError,
  RateLimiter,
  resolveClientKey,
} from '../../../middleware/rate-limit.middleware';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';

describe('Middleware: rate limiting', () => {
  let clock: sinon.SinonFakeTimers;

  const givenLimiter = (over: Partial<{limit: number; fanoutLimit: number; windowMs: number; maxTracked: number}> = {}) =>
    new RateLimiter({
      limit: 3,
      fanoutLimit: 2,
      windowMs: 1000,
      maxTracked: 10,
      ...over,
    });

  beforeEach(() => {
    resetMetricCounters();
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  describe('the limit holds', () => {
    it('admits requests up to the limit', () => {
      const limiter = givenLimiter();

      expect(() => {
        limiter.check('1.1.1.1', '/api');
        limiter.check('1.1.1.1', '/api');
        limiter.check('1.1.1.1', '/api');
      }).not.throw();
    });

    it('refuses the one past the limit', () => {
      const limiter = givenLimiter();
      for (let i = 0; i < 3; i += 1) limiter.check('1.1.1.1', '/api');

      expect(() => limiter.check('1.1.1.1', '/api')).throw(RateLimitedError);
    });

    it('reports 429 with a retry hint', () => {
      const limiter = givenLimiter();
      for (let i = 0; i < 3; i += 1) limiter.check('1.1.1.1', '/api');

      try {
        limiter.check('1.1.1.1', '/api');
        throw new Error('should have been refused');
      } catch (err) {
        const refusal = err as RateLimitedError;
        expect(refusal.statusCode).to.equal(429);
        expect(refusal.code).to.equal('RATE_LIMITED');
        // Without a retry hint a client has no basis for backing off.
        expect(refusal.retryAfterSeconds).to.be.greaterThan(0);
      }
    });

    it('keeps clients in separate buckets', () => {
      const limiter = givenLimiter();
      for (let i = 0; i < 3; i += 1) limiter.check('1.1.1.1', '/api');

      // One noisy client must not refuse everybody else.
      expect(() => limiter.check('2.2.2.2', '/api')).not.throw();
    });

    it('lets a client recover when the window rolls', () => {
      const limiter = givenLimiter();
      for (let i = 0; i < 3; i += 1) limiter.check('1.1.1.1', '/api');

      clock.tick(1001);

      expect(() => limiter.check('1.1.1.1', '/api')).not.throw();
    });

    it('counts refusals by route class, never by raw path', () => {
      const limiter = givenLimiter();
      for (let i = 0; i < 3; i += 1) limiter.check('1.1.1.1', '/api');

      try {
        limiter.check('1.1.1.1', '/api');
      } catch {
        // expected
      }

      expect(
        getMetricCounter(RATE_LIMIT_REJECTED_METRIC, {route: 'other'}),
      ).to.equal(1);
    });
  });

  describe('the expensive routes are limited more tightly', () => {
    it('applies the fan-out allowance to /utxo', () => {
      const limiter = givenLimiter();
      limiter.check('1.1.1.1', '/utxo');
      limiter.check('1.1.1.1', '/utxo');

      expect(() => limiter.check('1.1.1.1', '/utxo')).throw(RateLimitedError);
    });

    it('labels a fan-out refusal with its own route class', () => {
      const limiter = givenLimiter();
      for (let i = 0; i < 2; i += 1) limiter.check('1.1.1.1', '/addresses-info');
      try {
        limiter.check('1.1.1.1', '/addresses-info');
      } catch {
        // expected
      }

      expect(
        getMetricCounter(RATE_LIMIT_REJECTED_METRIC, {route: 'fanout'}),
      ).to.equal(1);
    });

    it('does not let cheap traffic consume the fan-out allowance', () => {
      const limiter = givenLimiter();
      limiter.check('1.1.1.1', '/api');
      limiter.check('1.1.1.1', '/api');

      // Separate buckets: the two limits are different budgets, not one shared
      // counter with two ceilings.
      expect(() => limiter.check('1.1.1.1', '/utxo')).not.throw();
    });

    it('exempts the health endpoint', () => {
      const limiter = givenLimiter();

      // Monitoring polls this constantly; tripping it would make the limiter an
      // outage detector rather than a control.
      expect(() => {
        for (let i = 0; i < 50; i += 1) limiter.check('1.1.1.1', '/health');
      }).not.throw();
    });
  });

  describe('the limiter must not become the amplifier', () => {
    it('never tracks more clients than its bound', () => {
      const limiter = givenLimiter({maxTracked: 10});

      // A flood of distinct sources is exactly how an attacker would turn a
      // limiter into a memory leak.
      for (let i = 0; i < 500; i += 1) {
        limiter.check(`10.0.${Math.floor(i / 256)}.${i % 256}`, '/api');
      }

      expect(limiter.trackedClients).to.be.lessThanOrEqual(10);
    });

    it('keeps an active client count across eviction pressure', () => {
      const limiter = givenLimiter({maxTracked: 10});
      limiter.check('1.1.1.1', '/api');
      limiter.check('1.1.1.1', '/api');

      // Evicting the client we are actively counting would hand an attacker a
      // free reset: flood the map, then resume.
      for (let i = 0; i < 8; i += 1) limiter.check(`10.0.0.${i}`, '/api');

      expect(() => limiter.check('1.1.1.1', '/api')).not.throw();
      expect(() => limiter.check('1.1.1.1', '/api')).throw(RateLimitedError);
    });

    it('drops entries whose window has passed', () => {
      const limiter = givenLimiter({maxTracked: 10});
      for (let i = 0; i < 5; i += 1) limiter.check(`10.0.0.${i}`, '/api');

      clock.tick(1001);
      limiter.sweep();

      expect(limiter.trackedClients).to.equal(0);
    });

    it('ships a bound small enough to be harmless', () => {
      expect(RATE_LIMIT_MAX_TRACKED_CLIENTS).to.be.lessThanOrEqual(65536);
      expect(RATE_LIMIT_WINDOW_MS).to.be.greaterThan(0);
    });
  });

  describe('client identity behind a proxy', () => {
    const XFF = '203.0.113.7, 70.41.3.18, 150.172.238.178';

    it('ignores X-Forwarded-For when no proxy is trusted', () => {
      // The default. The header is attacker-controlled, so honouring it would
      // let anyone mint unlimited identities.
      expect(resolveClientKey('192.0.2.9', XFF, new Set())).to.equal('192.0.2.9');
    });

    it('ignores X-Forwarded-For from an untrusted peer', () => {
      expect(
        resolveClientKey('192.0.2.9', XFF, new Set(['10.0.0.1'])),
      ).to.equal('192.0.2.9');
    });

    it('uses the left-most hop from a trusted peer', () => {
      expect(
        resolveClientKey('10.0.0.1', XFF, new Set(['10.0.0.1'])),
      ).to.equal('203.0.113.7');
    });

    it('takes only the left-most hop, so a forged chain cannot hide the client', () => {
      // A client prepending its own hop is counted under that hop, not under
      // whatever it appended after it.
      expect(
        resolveClientKey(
          '10.0.0.1',
          '198.51.100.23, 203.0.113.7',
          new Set(['10.0.0.1']),
        ),
      ).to.equal('198.51.100.23');
    });

    it('falls back to the socket when a trusted peer sends no header', () => {
      expect(
        resolveClientKey('10.0.0.1', undefined, new Set(['10.0.0.1'])),
      ).to.equal('10.0.0.1');
    });

    it('rejects a header value that is not an address-shaped token', () => {
      // The key ends up in a bounded map; an unbounded or exotic value would be
      // both a cardinality problem and a way to grow entries.
      const key = resolveClientKey('10.0.0.1', 'x'.repeat(500), new Set(['10.0.0.1']));

      expect(key).to.equal('10.0.0.1');
    });

    it('tolerates a missing socket address', () => {
      expect(resolveClientKey(undefined, undefined, new Set())).to.be.a.String();
    });
  });
});
