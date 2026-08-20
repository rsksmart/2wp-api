import {getLogger} from './logger';
import {incrementMetricCounter} from './metric-logger';
import {recordBudgetViolation, ResourceBudgetName} from './resource-budget';
import {getRequestSignal, getTraceId} from './trace-context';

const logger = getLogger('request-cancellation');

/** Counter incremented whenever a request's work is cancelled. */
export const REQUEST_CANCELLED_METRIC = 'request_cancelled_total';

/** Why a request's work was cancelled. Closed, low-cardinality vocabulary. */
export type CancellationReason = 'client_aborted' | 'timeout';

/** Status used when the client is already gone. Non-standard but conventional. */
export const CLIENT_CLOSED_REQUEST_STATUS = 499;

/**
 * Thrown to unwind work that no longer has anyone waiting for it.
 *
 * Carries its own status so it needs no translation step on the way out: a
 * client that aborted will never read a response, but the exchange still has to
 * be finished and the access log still records a status, and 499 keeps abandoned
 * requests distinguishable from real failures. A deadline breach is a 503 — the
 * service could not answer within the time it allows itself — and that one *is*
 * delivered.
 */
export class RequestCancelledError extends Error {
  /** HTTP status the error writer should report. */
  readonly statusCode: number;

  constructor(readonly reason: CancellationReason = 'client_aborted') {
    super(`Request cancelled: ${reason}`);
    this.name = 'RequestCancelledError';
    this.statusCode = reason === 'timeout' ? 503 : CLIENT_CLOSED_REQUEST_STATUS;
  }
}

/**
 * Records a cancellation.
 *
 * Only bounded scalars are logged — route, reason, elapsed time and how much
 * downstream work had already started — never the request payload.
 *
 * @param details - What was cancelled and why.
 */
export function recordCancellation(details: {
  reason: CancellationReason;
  route: string;
  elapsedMs: number;
  configuredLimitMs?: number;
}): void {
  const {reason, route, elapsedMs, configuredLimitMs} = details;
  logger.warn(
    {
      event: 'request_cancelled',
      reason,
      route,
      elapsedMs,
      traceId: getTraceId(),
    },
    'Request cancelled; downstream work stopped',
  );
  incrementMetricCounter(logger, REQUEST_CANCELLED_METRIC, {reason});

  // A vanished client is not a budget being exceeded, but a deadline is.
  if (reason === 'timeout' && configuredLimitMs !== undefined) {
    recordBudgetViolation({
      resource: ResourceBudgetName.REQUEST_DURATION_MS,
      configuredLimit: configuredLimitMs,
      observedValue: elapsedMs,
      route,
    });
  }
}

/**
 * The cancellation carried by an aborted signal.
 *
 * The middleware aborts with a {@link RequestCancelledError} as the reason, so
 * every consumer reports why the work stopped rather than guessing. A signal
 * aborted by anything else still yields a usable error.
 *
 * @param signal - The signal to read. May be absent.
 * @returns The cancellation, or `undefined` if the signal is live or absent.
 */
export function cancellationOf(
  signal: AbortSignal | undefined,
): RequestCancelledError | undefined {
  if (!signal?.aborted) {
    return undefined;
  }
  return signal.reason instanceof RequestCancelledError
    ? signal.reason
    : new RequestCancelledError();
}

/**
 * Throws if the current request has been cancelled.
 *
 * Called at points where more expensive work would otherwise be dispatched. Safe
 * to call with no request context — work with no client behind it, such as the
 * daemon's block sync, is never cancelled.
 *
 * @throws {RequestCancelledError} If the request's signal has been aborted.
 */
export function throwIfCancelled(): void {
  const cancellation = cancellationOf(getRequestSignal());
  if (cancellation) {
    throw cancellation;
  }
}
