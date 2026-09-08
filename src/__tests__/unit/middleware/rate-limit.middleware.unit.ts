import {expect} from '@loopback/testlab';
import {HttpErrors, MiddlewareContext, RestBindings} from '@loopback/rest';
import sinon from 'sinon';
import {
  RATE_LIMIT_MAX_FANOUT_REQUESTS,
  RATE_LIMIT_MAX_HEALTH_REQUESTS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_MAX_TRACKED_CLIENTS,
  RATE_LIMIT_WINDOW_MS,
} from '../../../config/resource-budgets';
import {
  RATE_LIMIT_REJECTED_METRIC,
  RATE_LIMITER_KEY,
  rateLimitMiddleware,
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

  const givenLimiter = (over: Partial<{limit: number; fanoutLimit: number; healthLimit: number; windowMs: number; maxTracked: number}> = {}) =>
    new RateLimiter({
      limit: 3,
      fanoutLimit: 2,
      healthLimit: 4,
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

  });

  describe('/health has an allowance of its own, not an exemption', () => {
    // It was exempt, which made it the one route in the API a client could send
    // without limit — and the trigger for the process kill this branch is about.
    // The exemption existed so monitoring could never be blocked; a separate,
    // generous allowance buys that without leaving an unmetered route.
    const givenHealthLimiter = () => givenLimiter({healthLimit: 5});

    it('refuses a client that hammers it', () => {
      const limiter = givenHealthLimiter();

      expect(() => {
        for (let i = 0; i < 50; i += 1) limiter.check('1.1.1.1', '/health');
      }).to.throw(RateLimitedError);
    });

    it('does not spend the ordinary allowance', () => {
      // Monitoring must not be able to lock a client out of the rest of the API,
      // and the rest of the API must not be able to lock out monitoring.
      const limiter = givenHealthLimiter();

      for (let i = 0; i < 5; i += 1) limiter.check('1.1.1.1', '/health');

      expect(() => limiter.check('1.1.1.1', '/anything')).to.not.throw();
    });

    it('is not spent by ordinary traffic', () => {
      const limiter = givenHealthLimiter();

      for (let i = 0; i < 3; i += 1) limiter.check('1.1.1.1', '/anything');

      expect(() => limiter.check('1.1.1.1', '/health')).to.not.throw();
    });

    it('labels a refusal by class, never by path', () => {
      const limiter = givenHealthLimiter();

      try {
        for (let i = 0; i < 50; i += 1) limiter.check('1.1.1.1', '/health');
      } catch {
        // expected
      }

      expect(
        getMetricCounter(RATE_LIMIT_REJECTED_METRIC, {route: 'health'}),
      ).to.equal(1);
      expect(
        getMetricCounter(RATE_LIMIT_REJECTED_METRIC, {route: '/health'}),
      ).to.equal(0);
    });

    it('recovers when the window rolls', () => {
      const limiter = givenHealthLimiter();
      for (let i = 0; i < 5; i += 1) limiter.check('1.1.1.1', '/health');

      clock.tick(1000);

      expect(() => limiter.check('1.1.1.1', '/health')).to.not.throw();
    });

    it('never blocks monitoring at a realistic cadence', () => {
      // With the shipped budgets rather than the small ones above: a poller at
      // 1 Hz for a whole window, which is faster than any monitoring here polls.
      const limiter = new RateLimiter({
        limit: RATE_LIMIT_MAX_REQUESTS,
        fanoutLimit: RATE_LIMIT_MAX_FANOUT_REQUESTS,
        healthLimit: RATE_LIMIT_MAX_HEALTH_REQUESTS,
        windowMs: RATE_LIMIT_WINDOW_MS,
        maxTracked: 16,
      });

      expect(() => {
        for (let i = 0; i < RATE_LIMIT_WINDOW_MS / 1000; i += 1) {
          limiter.check('10.0.0.1', '/health');
          clock.tick(1000);
        }
      }).to.not.throw();
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
    /*
     * This used to key on the **left-most** entry, and that was documented and
     * tested as the design. It is backwards.
     *
     * A proxy *appends* the address it observed. An AWS ALB receiving
     * `X-Forwarded-For: 1.2.3.4` from a client at 203.0.113.9 forwards
     * `1.2.3.4, 203.0.113.9` — so the left-most entry is whatever the client
     * typed, and the right-hand end is what the infrastructure actually saw. The
     * entry to trust is the one the last trusted proxy appended, counted from the
     * right.
     *
     * The old reading has two consequences, and both are the finding: a client
     * can mint unlimited identities by rotating the value it sends, and it can
     * put a third party's address in the bucket it is about to exhaust.
     */
    const TRUSTED = new Set(['10.0.0.1']);

    it('ignores X-Forwarded-For when no proxy is trusted', () => {
      // The default, and unchanged. With nothing in front of the app, the header
      // is pure client input.
      expect(
        resolveClientKey('192.0.2.9', '203.0.113.7', new Set()),
      ).to.equal('192.0.2.9');
    });

    it('ignores X-Forwarded-For from an untrusted peer', () => {
      // Unchanged, and the case a mutation test already verified: a peer that is
      // not a configured proxy has no forwarding claim worth believing.
      expect(
        resolveClientKey('192.0.2.9', '203.0.113.7', TRUSTED),
      ).to.equal('192.0.2.9');
    });

    it('counts against the hop the trusted proxy appended, not the one the client sent', () => {
      expect(
        resolveClientKey('10.0.0.1', '1.2.3.4, 203.0.113.9', TRUSTED),
      ).to.equal('203.0.113.9');
    });

    it('a client cannot mint identities by rotating the header', () => {
      // The heart of it. Every one of these is the same client arriving through
      // the same proxy, so every one has to land in the same bucket.
      const keys = ['1.2.3.4', '5.6.7.8', '9.10.11.12'].map(forged =>
        resolveClientKey('10.0.0.1', `${forged}, 203.0.113.9`, TRUSTED),
      );

      expect(new Set(keys).size).to.equal(1);
    });

    it('a client cannot push a victim into a blocked bucket', () => {
      // The other direction: spend somebody else's allowance by naming them.
      expect(
        resolveClientKey('10.0.0.1', '198.51.100.7, 203.0.113.9', TRUSTED),
      ).to.not.equal('198.51.100.7');
    });

    it('takes the hop before the last N proxies when N are configured', () => {
      // CloudFront in front of an ALB: the client's address is appended by
      // CloudFront, then CloudFront's own address is appended by the ALB.
      expect(
        resolveClientKey(
          '10.0.0.1',
          '1.2.3.4, 203.0.113.9, 198.51.100.1',
          TRUSTED,
          2,
        ),
      ).to.equal('203.0.113.9');
    });

    it('counts a single-entry header as the client when one proxy is trusted', () => {
      // A client that sent no header at all: the proxy's append is the whole
      // chain, and it is the client.
      expect(resolveClientKey('10.0.0.1', '203.0.113.9', TRUSTED)).to.equal(
        '203.0.113.9',
      );
    });

    it('falls back to the peer when the header has fewer hops than proxies', () => {
      // Fails closed. A shared bucket is a throughput problem; a forgeable
      // identity is the vulnerability. Trading the first for the second is how a
      // fix reintroduces the bug in the opposite direction.
      expect(
        resolveClientKey('10.0.0.1', '203.0.113.9', TRUSTED, 2),
      ).to.equal('10.0.0.1');
    });

    it('falls back to the socket when a trusted peer sends no header', () => {
      expect(resolveClientKey('10.0.0.1', undefined, TRUSTED)).to.equal(
        '10.0.0.1',
      );
    });

    it('rejects a header value that is not an address-shaped token', () => {
      // The key ends up in a bounded map; an unbounded or exotic value would be
      // both a cardinality problem and a way to grow entries.
      const key = resolveClientKey('10.0.0.1', 'x'.repeat(500), TRUSTED);

      expect(key).to.equal('10.0.0.1');
    });

    it('rejects a malformed value in the position it actually reads', () => {
      // The bound has to apply to the entry that becomes the key, not to the
      // one that used to.
      expect(
        resolveClientKey('10.0.0.1', `203.0.113.9, ${'x'.repeat(500)}`, TRUSTED),
      ).to.equal('10.0.0.1');
    });

    it('tolerates a missing socket address', () => {
      expect(resolveClientKey(undefined, undefined, new Set())).to.be.a.String();
    });
  });

  describe('the route class comes from the router, not the request path', () => {
    // The router accepts several spellings of one route — `/utxo` and `/utxo/`
    // both reach the controller — so a classifier keyed on the text the client
    // sent puts the same expensive route in two different buckets. Asking the
    // component that actually routes removes the whole family of variants
    // instead of the ones someone thought to enumerate.

    /** A router that resolves everything to one template, like the real one does. */
    const routerResolving = (template: string) => ({
      find: () => ({path: template}),
    });

    /** A router that refuses, the way `RoutingTable.find` does: by throwing. */
    const routerRefusing = () => ({
      find: () => {
        throw new HttpErrors.NotFound('Endpoint "POST /nope" not found.');
      },
    });

    const givenContext = (
      path: string,
      limiter: RateLimiter,
      router?: unknown,
    ) =>
      ({
        request: {
          path,
          method: 'POST',
          socket: {remoteAddress: '1.1.1.1'},
          headers: {},
        },
        get: async (key: unknown) => {
          const address = String(key);
          if (address === RATE_LIMITER_KEY) return limiter;
          if (address === String(RestBindings.ROUTER)) return router;
          return undefined;
        },
      }) as unknown as MiddlewareContext;

    const callTimes = async (
      times: number,
      path: string,
      limiter: RateLimiter,
      router?: unknown,
    ) => {
      const next = sinon.stub().resolves();
      for (let i = 0; i < times; i += 1) {
        await rateLimitMiddleware(givenContext(path, limiter, router), next);
      }
      return next;
    };

    it('counts a trailing-slash spelling against the fan-out allowance', async () => {
      const limiter = givenLimiter();

      await callTimes(2, '/utxo/', limiter, routerResolving('/utxo'));

      // The third would be the fourth of the cheap allowance, so a classifier
      // reading the raw path would still be admitting it here.
      await expect(
        rateLimitMiddleware(
          givenContext('/utxo/', limiter, routerResolving('/utxo')),
          sinon.stub().resolves(),
        ),
      ).to.be.rejectedWith(RateLimitedError);
    });

    it('counts a health spelling the router normalizes against the health class', async () => {
      const limiter = givenLimiter({healthLimit: 5});

      // Six calls: five inside the allowance, and one past it. A classifier
      // reading the raw path would file `/health/` under `other` and refuse at
      // four instead.
      const next = await callTimes(5, '/health/', limiter, routerResolving('/health'));

      expect(next.callCount).to.equal(5);
      await expect(
        rateLimitMiddleware(
          givenContext('/health/', limiter, routerResolving('/health')),
          sinon.stub().resolves(),
        ),
      ).to.be.rejectedWith(RateLimitedError);
    });

    it('treats an unroutable request as an ordinary route', async () => {
      const limiter = givenLimiter();
      const router = routerRefusing();

      // A refusing router must not become an error path of its own: the request
      // is simply not a fan-out request, and the 404 is the router's business.
      const next = await callTimes(3, '/utxo/not-a-route', limiter, router);

      expect(next.callCount).to.equal(3);
      await expect(
        rateLimitMiddleware(
          givenContext('/utxo/not-a-route', limiter, router),
          sinon.stub().resolves(),
        ),
      ).to.be.rejectedWith(RateLimitedError);
    });

    it('falls back to the request path when no router is reachable', async () => {
      const limiter = givenLimiter();

      // Documented degradation: with no router bound the classifier is exactly
      // as good as it was before — never worse. Making the fallback "ordinary
      // route" instead would turn a missing binding into a silent six-fold
      // widening of the fan-out allowance.
      await callTimes(2, '/utxo', limiter);

      await expect(
        rateLimitMiddleware(
          givenContext('/utxo', limiter, undefined),
          sinon.stub().resolves(),
        ),
      ).to.be.rejectedWith(RateLimitedError);
    });
  });
});
