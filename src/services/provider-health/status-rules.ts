import {HealthFailureReason} from './provider-health-check';

/** Failed checks in a row that turn an up provider down. */
export const DOWN_AFTER_FAILURES = 3;

/** Passed checks in a row that turn a down provider up. */
export const UP_AFTER_PASSES = 2;

export type ProviderStatus = 'up' | 'down';

/** What one check found. */
export interface CheckOutcome {
  /** Why the check failed; `null` when it passed. */
  reason: HealthFailureReason | null;
  /** How long the check took, in milliseconds. */
  durationMs: number;
  /** When the check ended. */
  checkedAt: Date;
}

/** A provider's health, as kept between checks. */
export interface ProviderHealthResult {
  status: ProviderStatus;
  /** When `status` last changed. */
  since: Date;
  /** Why the provider is down; `null` while it is up. */
  reason: HealthFailureReason | null;
  /** How long the last check took, in milliseconds. */
  durationMs: number;
  /** When the last check ended. */
  checkedAt: Date;
  /** Checks in a row that disagree with `status`. */
  streak: number;
}

/**
 * Works out a provider's health after one more check.
 *
 * The first check sets the status directly, so a provider that is down when
 * the API starts is reported down at once. After that the status changes only
 * after {@link DOWN_AFTER_FAILURES} failed or {@link UP_AFTER_PASSES} passed
 * checks in a row, so one slow answer does not flip it back and forth.
 *
 * While a down provider is recovering, the reason it went down is kept until
 * it is up again.
 *
 * @param previous - The health before this check; `undefined` for the first one.
 * @param outcome - What this check found.
 * @returns The health after this check.
 */
export function applyCheck(
  previous: ProviderHealthResult | undefined,
  outcome: CheckOutcome,
): ProviderHealthResult {
  const {reason, durationMs, checkedAt} = outcome;
  const observed: ProviderStatus = reason === null ? 'up' : 'down';
  if (!previous) {
    return {status: observed, since: checkedAt, reason, durationMs, checkedAt, streak: 0};
  }

  const streak = observed === previous.status ? 0 : previous.streak + 1;
  const threshold = observed === 'down' ? DOWN_AFTER_FAILURES : UP_AFTER_PASSES;
  const changes = streak >= threshold;
  const status = changes ? observed : previous.status;
  return {
    status,
    since: changes ? checkedAt : previous.since,
    reason: status === 'up' ? null : reason ?? previous.reason,
    durationMs,
    checkedAt,
    streak: changes ? 0 : streak,
  };
}
