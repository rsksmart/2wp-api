import {LifeCycleObserver} from '@loopback/core';
import {
  PROVIDER_HEALTH_CHECK_INTERVAL_MS,
  RESOURCE_BUDGET_DEFAULTS,
} from '../../config/resource-budgets';
import {getLogger, Logger} from '../../utils/logger';
import {failureReason} from './failure-reason';
import {HealthFailureReason, ProviderHealthCheck} from './provider-health-check';
import {ProviderHealthStore} from './provider-health.store';
import {nextState, ProviderHealthState, ProviderHealthStatus} from './status-rules';
import {withinTimeLimit} from './time-limit';

/**
 * Longest time one provider check may take, in milliseconds. A check still
 * running at this point is counted as a `timeout` failure.
 */
export const PROVIDER_HEALTH_CHECK_TIMEOUT_MS = 10_000;

/** How often the job runs and how long one check may take, in milliseconds. */
export interface ProviderHealthJobTiming {
  /** `0` turns the job off. Below `timeoutMs`, the job uses the default. */
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
  private roundInProgress?: Promise<void>;

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

  /**
   * Runs the first round now and schedules the rest. Does nothing when the
   * interval is `0`, and uses the default interval when it is below the timeout.
   */
  start(): void {
    if (this.intervalMs === 0) {
      this.logger.info({event: 'provider_health_job_off'}, 'Provider health checks are off');
      return;
    }
    if (this.timer) {
      return;
    }
    let {intervalMs} = this;
    if (intervalMs < this.timeoutMs) {
      // Rounds closer together than one check may take would call every
      // provider again almost as soon as the last round ends.
      intervalMs = RESOURCE_BUDGET_DEFAULTS.PROVIDER_HEALTH_CHECK_INTERVAL_MS;
      this.logger.warn(
        {
          event: 'provider_health_interval_too_short',
          configuredMs: this.intervalMs,
          timeoutMs: this.timeoutMs,
          intervalMs,
        },
        'Provider health check interval is below the check timeout; using the default',
      );
    }
    this.logger.info(
      {
        event: 'provider_health_job_started',
        intervalMs,
        providers: this.checks.map(check => check.provider),
      },
      'Provider health checks started',
    );
    this.runRound().catch(err => this.logRoundFailure(err));
    this.timer = setInterval(() => {
      this.runRound().catch(err => this.logRoundFailure(err));
    }, intervalMs);
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
    if (!this.roundInProgress) {
      this.roundInProgress = Promise.all(
        this.checks.map(check => this.refreshProviderHealth(check)),
      )
        .then(() => undefined)
        .finally(() => {
          this.roundInProgress = undefined;
        });
    }
    return this.roundInProgress;
  }

  /** Runs one check within the time limit and stores what it found. */
  private async refreshProviderHealth(check: ProviderHealthCheck): Promise<void> {
    const startedAt = Date.now();
    let reason: HealthFailureReason | null = null;
    let error: unknown;
    try {
      await withinTimeLimit(check.check(), this.timeoutMs, 'The check');
    } catch (err) {
      error = err;
      reason = failureReason(err);
    }
    const checkedAt = new Date();
    const previous = this.store.get(check.provider);
    const state = nextState(previous, {
      reason,
      durationMs: checkedAt.getTime() - startedAt,
      checkedAt,
    });
    this.store.set(check.provider, state);
    // Before its first check, a provider counts as up, so only a provider
    // that starts out down is logged.
    this.logIfStatusChanged(check.provider, previous?.status ?? 'up', state, error);
  }

  private logIfStatusChanged(
    provider: string,
    before: ProviderHealthStatus,
    state: ProviderHealthState,
    error: unknown,
  ): void {
    if (state.status === before) {
      return;
    }
    if (state.status === 'down') {
      this.logger.warn(
        {event: 'provider_down', provider, reason: state.reason, err: error as Error},
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
