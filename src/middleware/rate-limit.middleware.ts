/* eslint-disable max-classes-per-file -- the limiter and the refusal it raises
   are one concept: the control and the way it says no. */
import {Next} from '@loopback/core';
import {
  Middleware,
  MiddlewareContext,
  RestBindings,
  RestRouter,
} from '@loopback/rest';
import {
  RATE_LIMIT_MAX_FANOUT_REQUESTS,
  RATE_LIMIT_MAX_HEALTH_REQUESTS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_MAX_TRACKED_CLIENTS,
  RATE_LIMIT_TRUSTED_HOPS,
  RATE_LIMIT_WINDOW_MS,
} from '../config/resource-budgets';
import {getLogger} from '../utils/logger';
import {incrementMetricCounter} from '../utils/metric-logger';
import {
  recordBudgetViolation,
  ResourceBudgetName,
} from '../utils/resource-budget';

const logger = getLogger('rate-limit');

/** Refusals, labelled by route *class* — never the raw path. */
export const RATE_LIMIT_REJECTED_METRIC = 'rate_limit_rejected_total';

/**
 * Route classes the limiter distinguishes. A closed vocabulary on purpose: the
 * request path is attacker-controlled, so using it as a metric label would be
 * both a cardinality explosion and a way to push arbitrary text into the metrics
 * pipeline.
 */
export type RateLimitRouteClass = 'fanout' | 'health' | 'other';

/**
 * The expensive routes: each one multiplies a single request into far more work
 * than an ordinary GET.
 *
 * These are route *templates*, matched against what the router resolved — not
 * against the text a client sent. `/utxo` and `/utxo/` are the same route to the
 * router, so they have to be the same route to the limiter.
 *
 * `/utxo` and `/addresses-info` fan out to many provider calls each. The two
 * `tx-status` routes are here for a different reason with the same arithmetic:
 * on a database miss they re-parse a Bridge transaction, and ABI decoding
 * amplifies calldata into heap by ~225x. `MAX_BRIDGE_CALLDATA_BYTES` bounds one
 * request at ~7.2 MiB; this is what bounds how many of those can be in flight at
 * once. Neither bound is sufficient alone — the product is what has to stay
 * small, and `resource-budgets.unit.ts` asserts it.
 */
const FANOUT_ROUTES: ReadonlySet<string> = new Set([
  '/utxo',
  '/addresses-info',
  '/tx-status/{txId}',
  '/tx-status-by-type/{txId}/{txType}',
]);

/**
 * The monitoring route, which gets an allowance rather than an exemption.
 *
 * It used to be exempt, and the reasoning was sound as far as it went: `/health`
 * is polled continuously, and sharing a bucket with public traffic would let an
 * attacker blind the operators by spending it. What the exemption actually
 * bought, though, was the one route in this API a client could send without any
 * ceiling at all — on a path that reaches every dependency the service has, and
 * that turned out to be the trigger for a process kill.
 *
 * A separate bucket gives the same guarantee without the hole. Ordinary traffic
 * cannot spend the monitoring allowance and monitoring cannot spend the ordinary
 * one, exactly as before; the difference is that `/health` now has a number.
 * `RATE_LIMIT_MAX_HEALTH_REQUESTS` is deliberately far above any real polling
 * cadence, so the only client it can refuse is one that is not monitoring.
 */
const HEALTH_ROUTES: ReadonlySet<string> = new Set(['/health']);

/**
 * The class a resolved route counts against.
 *
 * @param route - The route template the router resolved, not the raw path.
 * @returns Which allowance this route spends.
 */
export function classifyRoute(route: string): RateLimitRouteClass {
  if (FANOUT_ROUTES.has(route)) {
    return 'fanout';
  }
  return HEALTH_ROUTES.has(route) ? 'health' : 'other';
}

/** Addresses are the map keys, so the shape is constrained deliberately. */
const ADDRESS_TOKEN = /^[0-9a-fA-F:.]{3,45}$/;

/** Key used when the socket address is unavailable. */
const UNKNOWN_CLIENT = 'unknown';

/**
 * Resolves the identity a request is counted against.
 *
 * Behind a proxy every request carries the proxy's socket address, so keying on
 * the socket alone puts the whole internet in one bucket — simultaneously
 * useless and an outage. Keying on `X-Forwarded-For` unconditionally is worse:
 * the header is attacker-controlled, so anyone could mint unlimited identities
 * or impersonate another client into a block.
 *
 * So the header is honoured only when the immediate socket peer is a configured
 * trusted proxy — and then the entry read is counted **from the right**.
 *
 * **This used to read the left-most entry, and that was backwards.** A proxy
 * *appends* the address it observed, so the chain grows rightwards and the
 * left-hand end is whatever the client typed. An AWS ALB receiving
 * `X-Forwarded-For: 1.2.3.4` from a client at 203.0.113.9 forwards
 * `1.2.3.4, 203.0.113.9`. Reading the left-most entry therefore keyed every
 * request on client-supplied text, which is the whole problem twice over: a
 * client could mint unlimited identities by rotating that value, and could put a
 * third party's address into the bucket it was about to exhaust.
 *
 * `RATE_LIMIT_TRUSTED_HOPS` is how many proxies are in front, so the client sits
 * that many entries from the end. It is deployment configuration rather than
 * something inferred at runtime: the trusted-proxy *list* is the set of addresses
 * the immediate peer may have — a load balancer has several nodes — which says
 * nothing about how long the chain is. Guessing it wrong is not a degradation, it
 * is the same forgeable identity in the other direction.
 *
 * Every failure here falls back to the socket peer. A shared bucket is a
 * throughput problem; a forgeable identity is the vulnerability, and trading the
 * first for the second is how a fix reintroduces the bug it was written for.
 *
 * With no trusted proxies configured (the default) the header is ignored
 * entirely, which is correct when the API is directly exposed — and is also why
 * this has no effect until `RATE_LIMIT_TRUSTED_PROXIES` is set for the
 * environment.
 *
 * @param socketAddress - Address of the immediate peer.
 * @param forwardedFor - Raw `X-Forwarded-For` value, if any.
 * @param trustedProxies - Peers whose forwarding claims are believed.
 * @param trustedHops - Proxies in front of this service. Defaults to the budget.
 * @returns The key to count this request against.
 */
export function resolveClientKey(
  socketAddress: string | undefined,
  forwardedFor: string | undefined,
  trustedProxies: ReadonlySet<string>,
  trustedHops: number = RATE_LIMIT_TRUSTED_HOPS,
): string {
  const peer = socketAddress ?? UNKNOWN_CLIENT;
  if (!forwardedFor || !trustedProxies.has(peer)) {
    return peer;
  }
  const hops = forwardedFor.split(',');
  // The last trusted proxy appended the address it saw, so the client is that
  // many entries from the end. A chain shorter than the configured topology is
  // not something to guess at: it means the request did not arrive the way the
  // configuration says it does.
  const index = hops.length - trustedHops;
  if (index < 0) {
    return peer;
  }
  const claimed = hops[index]?.trim();
  // A malformed or oversized claim falls back to the peer rather than becoming
  // a map key of arbitrary shape.
  return claimed && ADDRESS_TOKEN.test(claimed) ? claimed : peer;
}

/**
 * Reads the trusted-proxy set from the environment.
 *
 * A list rather than a number, so it does not belong in `resource-budgets.ts`.
 * Validated here: anything that is not address-shaped is dropped with a warning
 * rather than silently widening trust.
 *
 * @param raw - Comma-separated addresses, typically `RATE_LIMIT_TRUSTED_PROXIES`.
 * @returns The validated set, empty when nothing is configured.
 */
export function parseTrustedProxies(raw: string | undefined): Set<string> {
  if (!raw) {
    return new Set<string>();
  }
  const candidates = raw
    .split(',')
    .map(token => token.trim())
    .filter(token => token.length > 0);
  const [valid, invalid] = [
    candidates.filter(c => ADDRESS_TOKEN.test(c)),
    candidates.filter(c => !ADDRESS_TOKEN.test(c)),
  ];
  invalid.forEach(candidate =>
    logger.warn(
      {method: 'parseTrustedProxies', length: candidate.length},
      'Ignoring a trusted-proxy entry that is not address-shaped',
    ),
  );
  return new Set(valid);
}

/** A refused request. Carries its own status and retry hint. */
export class RateLimitedError extends Error {
  readonly statusCode = 429;
  /** Distinguishes this refusal from the other bounded refusals. */
  readonly code = 'RATE_LIMITED';
  readonly retryAfterSeconds: number;

  constructor(
    readonly routeClass: RateLimitRouteClass,
    retryAfterMs: number,
  ) {
    super(`Rate limit exceeded for ${routeClass} routes`);
    this.name = 'RateLimitedError';
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  }
}

/** Records a refusal and builds the error for it. */
function refuse(
  routeClass: RateLimitRouteClass,
  limit: number,
  observed: number,
  remainingMs: number,
): RateLimitedError {
  incrementMetricCounter(logger, RATE_LIMIT_REJECTED_METRIC, {
    route: routeClass,
  });
  recordBudgetViolation({
    resource: ResourceBudgetName.RATE_LIMIT,
    configuredLimit: limit,
    observedValue: observed,
    detail: routeClass,
  });
  return new RateLimitedError(routeClass, remainingMs);
}

interface RateLimiterOptions {
  limit: number;
  fanoutLimit: number;
  healthLimit: number;
  windowMs: number;
  maxTracked: number;
}

/** One client's counters for the current window. */
interface ClientState {
  windowStartedAt: number;
  counts: Record<RateLimitRouteClass, number>;
  lastSeenAt: number;
}

/**
 * A fresh set of counters.
 *
 * Written once rather than zeroed field by field: the previous version listed
 * the classes by hand when a window rolled, so adding a third class would have
 * left it uncleared and given that class an allowance that never resets.
 */
const emptyCounts = (): Record<RateLimitRouteClass, number> => ({
  fanout: 0,
  health: 0,
  other: 0,
});

/**
 * Fixed-window request counting, per client and per route class.
 *
 * Fixed windows rather than a sliding log: a log grows per request, which would
 * make the limiter itself the thing that consumes memory under attack. Two
 * counters and a timestamp per client is the whole state.
 */
export class RateLimiter {
  private readonly clients = new Map<string, ClientState>();

  constructor(private readonly options: RateLimiterOptions) {}

  /** How many clients are currently tracked. */
  get trackedClients(): number {
    return this.clients.size;
  }

  /**
   * Counts a request and refuses it if the client is over its allowance.
   *
   * @param clientKey - Identity from {@link resolveClientKey}.
   * @param route - The resolved route template, used only to pick the route
   *   class. Not the raw request path: see {@link FANOUT_ROUTES}.
   * @throws {RateLimitedError} When the client is over its allowance.
   */
  check(clientKey: string, route: string): void {
    const routeClass = classifyRoute(route);
    const limit = this.limitFor(routeClass);
    const now = Date.now();

    const state = this.stateFor(clientKey, now);
    state.lastSeenAt = now;
    if (now - state.windowStartedAt >= this.options.windowMs) {
      state.windowStartedAt = now;
      state.counts = emptyCounts();
    }

    state.counts[routeClass] += 1;
    if (state.counts[routeClass] > limit) {
      const remainingMs = this.options.windowMs - (now - state.windowStartedAt);
      throw refuse(routeClass, limit, state.counts[routeClass], remainingMs);
    }
  }

  /**
   * Forgets every client.
   *
   * Intended for tests: the limiter is process-wide by design, so a suite that
   * deliberately bursts would otherwise consume the allowance of the suites that
   * follow it. Mirrors `resetMetricCounters`.
   */
  reset(): void {
    this.clients.clear();
  }

  /** The allowance a route class spends from. */
  private limitFor(routeClass: RateLimitRouteClass): number {
    switch (routeClass) {
      case 'fanout':
        return this.options.fanoutLimit;
      case 'health':
        return this.options.healthLimit;
      default:
        return this.options.limit;
    }
  }

  /** Drops entries whose window has elapsed. Safe to call on a timer. */
  sweep(): void {
    const now = Date.now();
    // Snapshot the keys first: deleting while iterating the live map is legal
    // for Map, but the snapshot keeps the intent obvious.
    [...this.clients.entries()]
      .filter(([, state]) => now - state.lastSeenAt >= this.options.windowMs)
      .forEach(([key]) => this.clients.delete(key));
  }

  private stateFor(clientKey: string, now: number): ClientState {
    const existing = this.clients.get(clientKey);
    if (existing) {
      return existing;
    }
    if (this.clients.size >= this.options.maxTracked) {
      this.evictOne(now, clientKey);
    }
    const fresh: ClientState = {
      windowStartedAt: now,
      counts: emptyCounts(),
      lastSeenAt: now,
    };
    this.clients.set(clientKey, fresh);
    return fresh;
  }

  /**
   * Makes room for one more client.
   *
   * Evicts the least recently seen entry, never the caller being counted right
   * now: evicting an active client would hand an attacker a free reset — flood
   * the map to displace your own counter, then resume.
   */
  private evictOne(now: number, incomingKey: string): void {
    this.sweep();
    if (this.clients.size < this.options.maxTracked) {
      return;
    }
    const oldest = [...this.clients.entries()]
      .filter(([key]) => key !== incomingKey)
      .reduce<
        [string, ClientState] | undefined
      >((candidate, entry) => (!candidate || entry[1].lastSeenAt < candidate[1].lastSeenAt ? entry : candidate), undefined);
    if (oldest) {
      this.clients.delete(oldest[0]);
    }
  }
}

/**
 * Binding key for an alternative limiter.
 *
 * The limiter is a process-wide singleton by design — the allowance has to hold
 * across every request the process serves. That makes it shared state for tests
 * running in one mocha process, several of which burst on purpose to exercise
 * *other* controls. Binding a permissive limiter expresses "not the subject of
 * this suite" as configuration, rather than adding a bypass to production code.
 *
 * Same shape as the provider pool's injectable `permits` option, for the same
 * reason.
 */
export const RATE_LIMITER_KEY = 'middleware.rateLimiter';

/** The process-wide limiter. */
export const requestRateLimiter = new RateLimiter({
  limit: RATE_LIMIT_MAX_REQUESTS,
  fanoutLimit: RATE_LIMIT_MAX_FANOUT_REQUESTS,
  healthLimit: RATE_LIMIT_MAX_HEALTH_REQUESTS,
  windowMs: RATE_LIMIT_WINDOW_MS,
  maxTracked: RATE_LIMIT_MAX_TRACKED_CLIENTS,
});

const trustedProxies = parseTrustedProxies(
  process.env.RATE_LIMIT_TRUSTED_PROXIES,
);

// `unref` so a pending sweep cannot hold the process open at shutdown, the same
// reason the request deadline uses it.
const sweeper = setInterval(
  () => requestRateLimiter.sweep(),
  RATE_LIMIT_WINDOW_MS,
);
sweeper.unref();

/**
 * The route a request resolves to, as a template, or `undefined` when it does
 * not resolve to one.
 *
 * Asking the router instead of reading `request.path` is what makes the
 * classification immune to spelling. The router accepts `/utxo` and `/utxo/` for
 * the same route, so anything keyed on the text the client sent files one
 * expensive route under two allowances — and the cheap one is six times wider.
 * Enumerating variants only covers the ones somebody thought of; asking the
 * component that routes covers the ones nobody did.
 *
 * The two router shapes disagree about how to say "no route": `RestRouter.find`
 * answers `undefined`, `RoutingTable.find` throws `NotFound`. Both collapse to
 * `undefined` here — an unroutable request is simply not a fan-out request, and
 * the 404 is the router's business, not this middleware's.
 *
 * @param ctx - The middleware context for this request.
 * @returns The route template, or `undefined` if the request resolves to no route.
 */
async function resolveRouteTemplate(
  ctx: MiddlewareContext,
): Promise<string | undefined> {
  const router = await ctx.get<RestRouter>(RestBindings.ROUTER, {
    optional: true,
  });
  if (!router) {
    return undefined;
  }
  try {
    return router.find(ctx.request)?.path;
  } catch {
    return undefined;
  }
}

/**
 * Refuses requests from a client that is over its allowance.
 *
 * Registered as the cheapest possible refusal: one header read and a map lookup,
 * before any payload is touched. It sits after the bounded error writer so the
 * 429 is bounded and correlated by `traceId`, and before the body budget so an
 * over-limit client's payload is never buffered at all.
 */
export const rateLimitMiddleware: Middleware = async (
  ctx: MiddlewareContext,
  next: Next,
) => {
  const limiter =
    (await ctx.get<RateLimiter>(RATE_LIMITER_KEY, {optional: true})) ??
    requestRateLimiter;
  const {request} = ctx;
  const clientKey = resolveClientKey(
    request.socket?.remoteAddress,
    request.headers['x-forwarded-for'] as string | undefined,
    trustedProxies,
  );
  // Falling back to the raw path leaves this no worse than classifying on the
  // path alone, which is what it did before. Falling back to "ordinary route"
  // instead would turn a missing router binding into a silent six-fold widening
  // of the fan-out allowance — a weakening with no symptom.
  const route = (await resolveRouteTemplate(ctx)) ?? request.path;
  limiter.check(clientKey, route);
  return next();
};
