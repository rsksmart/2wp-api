/* eslint-disable max-classes-per-file -- the semaphore and the error it raises
   are one concept: the pool and the way it says no. Splitting them would put
   the contract in one file and its failure mode in another. */
import {Counter, Gauge} from '@prometheus-io/client';
import {
  BLOCKBOOK_MAX_IN_FLIGHT,
  BLOCKBOOK_QUEUE_MAX_DEPTH,
  BLOCKBOOK_QUEUE_MAX_WAIT_MS,
  TX_PROVIDER_MAX_IN_FLIGHT,
} from '../config/resource-budgets';
import {METRICS_PREFIX, metricsRegistry} from './metrics';
import {cancellationOf, RequestCancelledError} from './request-cancellation';
import {recordBudgetViolation, ResourceBudgetName} from './resource-budget';
import {getRequestSignal} from './trace-context';

/** Gauge: permits currently held. */
export const PROVIDER_PERMITS_ACTIVE_GAUGE = `${METRICS_PREFIX}provider_permits_active`;
/** Gauge: callers currently waiting for a permit. */
export const PROVIDER_PERMITS_QUEUED_GAUGE = `${METRICS_PREFIX}provider_permits_queued`;
/** Counter: permits handed out. */
export const PROVIDER_PERMITS_GRANTED_METRIC = `${METRICS_PREFIX}provider_permits_granted_total`;
/** Counter: callers refused, labelled by reason. */
export const PROVIDER_PERMITS_REJECTED_METRIC = `${METRICS_PREFIX}provider_permits_rejected_total`;

/** Why a caller was refused a permit. Closed, low-cardinality vocabulary. */
export const PERMIT_REJECTION_REASONS = ['queue_full', 'wait_timeout'] as const;

export type PermitRejectionReason = (typeof PERMIT_REJECTION_REASONS)[number];

export const providerPermitsActive = new Gauge<'pool'>({
  name: PROVIDER_PERMITS_ACTIVE_GAUGE,
  help: 'Provider permits currently held, by pool.',
  labelNames: ['pool'],
  registers: [metricsRegistry],
});

export const providerPermitsQueued = new Gauge<'pool'>({
  name: PROVIDER_PERMITS_QUEUED_GAUGE,
  help: 'Callers currently waiting for a provider permit, by pool.',
  labelNames: ['pool'],
  registers: [metricsRegistry],
});

export const providerPermitsGrantedTotal = new Counter<'pool'>({
  name: PROVIDER_PERMITS_GRANTED_METRIC,
  help: 'Provider permits handed out, by pool.',
  labelNames: ['pool'],
  registers: [metricsRegistry],
});

export const providerPermitsRejectedTotal = new Counter<'pool' | 'reason'>({
  name: PROVIDER_PERMITS_REJECTED_METRIC,
  help: 'Callers refused a provider permit, by pool and reason.',
  labelNames: ['pool', 'reason'],
  registers: [metricsRegistry],
});

/**
 * Raised when the pool and its queue are both full.
 *
 * Carries a 503 rather than a 429: the pool is shared, so being at capacity may
 * have nothing to do with the caller being refused. `Retry-After` is derived
 * from the wait budget, since that is the timescale on which capacity frees up.
 */
export class PermitRejectedError extends Error {
  readonly statusCode = 503;
  /**
   * Distinguishes this refusal from the other 503 the service can return, which
   * is a request that outlived its own deadline. Same status, different cause,
   * and only this one means "come back shortly".
   */
  readonly code = 'SERVICE_OVERLOADED';
  readonly retryAfterSeconds: number;

  constructor(
    readonly pool: string,
    readonly reason: PermitRejectionReason,
    waitMs: number = BLOCKBOOK_QUEUE_MAX_WAIT_MS,
  ) {
    super(`No ${pool} capacity available: ${reason}`);
    this.name = 'PermitRejectedError';
    this.retryAfterSeconds = Math.max(1, Math.ceil(waitMs / 1000));
  }
}

/** Aggregated wait times. A sum/count/max triple rather than a histogram. */
export interface WaitStats {
  sum: number;
  count: number;
  max: number;
}

interface SemaphoreOptions {
  /** Pool name, used as the metric label. */
  name: string;
  /** Permits available at once. */
  limit: number;
  /** Callers allowed to wait. */
  queueDepth: number;
  /** How long a caller may wait, in milliseconds. */
  waitMs: number;
}

interface Waiter {
  grant: () => void;
  refuse: (err: Error) => void;
}

/**
 * A counting semaphore with a bounded queue and cancellation-aware waiting.
 *
 * `PROVIDER_CONCURRENCY` bounds fan-out inside one request; concurrent requests
 * multiply it, so the total is whatever load happens to arrive. This bounds the
 * total instead. The queue is capped in both depth and time on purpose — an
 * unbounded wait queue converts a throughput problem into a heap problem, which
 * is the shape of the issue being fixed.
 */
export class Semaphore {
  private readonly options: SemaphoreOptions;
  private readonly waiters: Waiter[] = [];
  private held = 0;
  private waits: WaitStats = {sum: 0, count: 0, max: 0};

  constructor(options: SemaphoreOptions) {
    this.options = options;
  }

  /** Pool name, as it appears in metric labels. */
  get name(): string {
    return this.options.name;
  }

  /** Permits available at once. */
  get limit(): number {
    return this.options.limit;
  }

  /** Permits currently held. */
  get active(): number {
    return this.held;
  }

  /** Callers currently waiting. */
  get queued(): number {
    return this.waiters.length;
  }

  /** Aggregated wait times since process start. */
  get waitStats(): WaitStats {
    return {...this.waits};
  }

  /**
   * Runs `work` while holding a permit.
   *
   * The permit is always released, including when `work` throws — a leaked
   * permit shrinks the pool permanently and degrades into an outage, which
   * would be worse than the exhaustion it exists to prevent.
   *
   * @param work - The operation to run under a permit.
   * @returns Whatever `work` returns.
   * @throws {RequestCancelledError} If the request is cancelled before the permit is granted.
   * @throws {PermitRejectedError} If the pool and its queue are both full.
   */
  async run<T>(work: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await work();
    } finally {
      this.release();
    }
  }

  /** Takes a permit, waiting if necessary. */
  private async acquire(): Promise<void> {
    // Cheapest possible refusal: never queue work that is already abandoned.
    const alreadyCancelled = cancellationOf(getRequestSignal());
    if (alreadyCancelled) {
      throw alreadyCancelled;
    }

    if (this.held < this.options.limit) {
      this.take();
      return;
    }

    if (this.waiters.length >= this.options.queueDepth) {
      this.refuse('queue_full');
    }

    await this.waitForPermit();
  }

  /** Registers as a waiter and settles when granted, timed out, or cancelled. */
  private waitForPermit(): Promise<void> {
    const startedAt = Date.now();
    const signal = getRequestSignal();

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      let onAbort: (() => void) | undefined;

      const cleanup = () => {
        settled = true;
        clearTimeout(timer);
        if (onAbort) {
          signal?.removeEventListener('abort', onAbort);
        }
        const index = this.waiters.indexOf(waiter);
        if (index !== -1) {
          this.waiters.splice(index, 1);
          providerPermitsQueued.dec({pool: this.options.name});
        }
      };

      const waiter: Waiter = {
        grant: () => {
          if (settled) {
            // Already gone; the permit must go to somebody else rather than
            // being dropped on the floor.
            return;
          }
          cleanup();
          this.recordWait(Date.now() - startedAt);
          this.take();
          resolve();
        },
        refuse: (err: Error) => {
          if (settled) {
            return;
          }
          cleanup();
          reject(err);
        },
      };

      this.waiters.push(waiter);
      providerPermitsQueued.inc({pool: this.options.name});

      timer = setTimeout(() => {
        waiter.refuse(this.rejection('wait_timeout'));
      }, this.options.waitMs);
      timer.unref();

      if (signal) {
        onAbort = () =>
          waiter.refuse(cancellationOf(signal) ?? new RequestCancelledError());
        signal.addEventListener('abort', onAbort, {once: true});
      }
    });
  }

  /** Marks a permit as held. */
  private take(): void {
    this.held += 1;
    providerPermitsActive.inc({pool: this.options.name});
    providerPermitsGrantedTotal.inc({pool: this.options.name});
  }

  /** Returns a permit and hands it to the next waiter, if any. */
  private release(): void {
    // Clamped, and the gauge only moves when the count did, so a double release
    // can never drive it below zero.
    if (this.held > 0) {
      this.held -= 1;
      providerPermitsActive.dec({pool: this.options.name});
    }

    // Skip waiters that have already given up, so a cancelled queue does not
    // swallow the permit that was meant for whoever is still waiting.
    while (this.waiters.length > 0 && this.held < this.options.limit) {
      const next = this.waiters.shift();
      providerPermitsQueued.dec({pool: this.options.name});
      const before = this.held;
      next?.grant();
      if (this.held > before) {
        return;
      }
    }
  }

  /** Records and throws a refusal. */
  private refuse(reason: PermitRejectionReason): never {
    throw this.rejection(reason);
  }

  private rejection(reason: PermitRejectionReason): PermitRejectedError {
    const {name, limit} = this.options;
    providerPermitsRejectedTotal.inc({pool: name, reason});
    recordBudgetViolation({
      resource: ResourceBudgetName.PROVIDER_PERMITS,
      configuredLimit: limit,
      observedValue: this.held + this.waiters.length,
      detail: `${name}: ${reason}`,
    });
    return new PermitRejectedError(name, reason, this.options.waitMs);
  }

  private recordWait(ms: number): void {
    this.waits = {
      sum: this.waits.sum + ms,
      count: this.waits.count + 1,
      max: Math.max(this.waits.max, ms),
    };
  }
}

/**
 * The process-wide Blockbook pool.
 *
 * Module scope on purpose: the limit has to hold across every request the
 * process handles, which is exactly what per-request state cannot do.
 */
export const blockbookPermits = new Semaphore({
  name: 'blockbook',
  limit: BLOCKBOOK_MAX_IN_FLIGHT,
  queueDepth: BLOCKBOOK_QUEUE_MAX_DEPTH,
  waitMs: BLOCKBOOK_QUEUE_MAX_WAIT_MS,
});

/**
 * The transaction-lookup pool, deliberately separate and deliberately small.
 *
 * `GET /tx` and the pegin status path return the raw Bitcoin transaction in
 * `hex`, so their responses are measured in megabytes where every other
 * Blockbook call is measured in kilobytes. They need a much larger response
 * budget, and a large budget on a 50-slot pool multiplies into more heap than the
 * process has.
 *
 * Splitting the pool is what lets the two move independently: the expensive calls
 * get the size they legitimately need and pay for it in concurrency, while a
 * burst of them can no longer starve the cheap calls of the general pool's
 * permits. The metric label differs too (`blockbook-tx`), so a saturated
 * transaction pool is visible rather than hidden behind a healthy general one.
 *
 * The queue settings are shared with the general pool on purpose: how long a
 * caller should wait before being told to come back is a property of the service,
 * not of which upstream path it needed.
 */
export const txProviderPermits = new Semaphore({
  name: 'blockbook-tx',
  limit: TX_PROVIDER_MAX_IN_FLIGHT,
  queueDepth: BLOCKBOOK_QUEUE_MAX_DEPTH,
  waitMs: BLOCKBOOK_QUEUE_MAX_WAIT_MS,
});

// A series that does not exist yet cannot be alerted on.
[blockbookPermits, txProviderPermits].forEach(({name: pool}) => {
  providerPermitsActive.set({pool}, 0);
  providerPermitsQueued.set({pool}, 0);
  providerPermitsGrantedTotal.inc({pool}, 0);
  PERMIT_REJECTION_REASONS.forEach(reason =>
    providerPermitsRejectedTotal.inc({pool, reason}, 0),
  );
});
