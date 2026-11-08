import {LifeCycleObserver} from '@loopback/core';
import {
  PROVIDER_HEALTH_CHECK_INTERVAL_MS,
  PROVIDER_HEALTH_CHECK_TIMEOUT_MS,
} from '../../config/resource-budgets';
import {getLogger, Logger} from '../../utils/logger';
import {failureReason} from './failure-reason';
import {
  HealthFailureReason,
  ProviderCheckFailure,
  ProviderHealthCheck,
} from './provider-health-check';
import {ProviderHealthStore} from './provider-health.store';
import {applyCheck, ProviderHealthResult, ProviderStatus} from './status-rules';

/** How often the job runs and how long one check may take, in milliseconds. */
export interface ProviderHealthJobTiming {
  /** `0` turns the job off. */
  intervalMs: number;
  timeoutMs: number;
}

/**
 * Checks every provider on a timer and stores the result, so `/health` can
 * report provider health without contacting any provider.
 *
 * The first round runs as soon as the job starts, then one round every
 * interval. Each check gets its own time limit; a check still running when the
 * limit passes is counted as a `timeout` failure and left to finish on its own.
 * A status change is logged once, not on every check.
 */
export class ProviderHealthJob implements LifeCycleObserver {
  logger: Logger;
  private readonly intervalMs: number;
  private readonly timeoutMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private round?: Promise<void>;

  /**
   * @param checks - One check per provider.
   * @param store - Where each provider's health is kept.
   * @param timing - Defaults to `PROVIDER_HEALTH_CHECK_INTERVAL_MS` and
   * `PROVIDER_HEALTH_CHECK_TIMEOUT_MS`.
   */
  constructor(
    private readonly checks: readonly ProviderHealthCheck[],
    private readonly store: ProviderHealthStore,
    {
      intervalMs = PROVIDER_HEALTH_CHECK_INTERVAL_MS,
      timeoutMs = PROVIDER_HEALTH_CHECK_TIMEOUT_MS,
    }: Partial<ProviderHealthJobTiming> = {},
  ) {
    this.logger = getLogger('provider-health-job');
    this.intervalMs = intervalMs;
    this.timeoutMs = timeoutMs;
  }

  /** Runs the first round now and schedules the rest. Does nothing when the interval is `0`. */
  start(): void {
    if (this.intervalMs === 0) {
      this.logger.info({event: 'provider_health_job_off'}, 'Provider health checks are off');
      return;
    }
    if (this.timer) {
      return;
    }
    this.logger.info(
      {
        event: 'provider_health_job_started',
        intervalMs: this.intervalMs,
        providers: this.checks.map(check => check.provider),
      },
      'Provider health checks started',
    );
    this.runRound().catch(err => this.logRoundFailure(err));
    this.timer = setInterval(() => {
      this.runRound().catch(err => this.logRoundFailure(err));
    }, this.intervalMs);
    // The job must never be what keeps the process alive.
    this.timer.unref();
  }

  /** Stops scheduling rounds. A round already running finishes on its own. */
  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  /**
   * Checks every provider once and stores the results.
   *
   * @returns Resolves once every result is stored. While a round is running,
   * returns that round instead of starting another one.
   */
  runRound(): Promise<void> {
    if (!this.round) {
      this.round = Promise.all(this.checks.map(check => this.runCheck(check)))
        .then(() => undefined)
        .finally(() => {
          this.round = undefined;
        });
    }
    return this.round;
  }

  /** Runs one check within the time limit and stores what it found. */
  private async runCheck(check: ProviderHealthCheck): Promise<void> {
    const startedAt = Date.now();
    let reason: HealthFailureReason | null = null;
    let error: unknown;
    try {
      await this.withinTimeLimit(check.check());
    } catch (err) {
      error = err;
      reason = failureReason(err);
    }
    const checkedAt = new Date();
    const previous = this.store.get(check.provider);
    const result = applyCheck(previous, {
      reason,
      durationMs: checkedAt.getTime() - startedAt,
      checkedAt,
    });
    this.store.set(check.provider, result);
    // Before its first check, a provider counts as up, so only a provider
    // that starts out down is logged.
    this.logChange(check.provider, previous?.status ?? 'up', result, error);
  }

  /** Rejects with a `timeout` failure if `work` takes longer than the limit. */
  private withinTimeLimit(work: Promise<void>): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeLimit = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new ProviderCheckFailure(
              'timeout',
              `The check took longer than ${this.timeoutMs} ms`,
            ),
          ),
        this.timeoutMs,
      );
    });
    return Promise.race([work, timeLimit]).finally(() => clearTimeout(timer));
  }

  private logChange(
    provider: string,
    before: ProviderStatus,
    result: ProviderHealthResult,
    error: unknown,
  ): void {
    if (result.status === before) {
      return;
    }
    if (result.status === 'down') {
      this.logger.warn(
        {event: 'provider_down', provider, reason: result.reason, err: error as Error},
        'Provider is down',
      );
    } else {
      this.logger.info({event: 'provider_up', provider}, 'Provider is up again');
    }
  }

  /** A round should never reject; if one does, log it rather than leave it unhandled. */
  private logRoundFailure(err: unknown): void {
    this.logger.error(
      {event: 'provider_health_round_failed', err: err as Error},
      'Provider health round failed',
    );
  }
}
