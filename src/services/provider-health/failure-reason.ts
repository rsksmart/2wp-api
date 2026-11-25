import {
  ProviderHttpStatusError,
  ProviderTimeoutError,
} from '../../utils/bounded-http-client';
import {HealthFailureReason, ProviderCheckFailure} from './provider-health-check';

/** Error codes that mean the provider did not answer in time. */
const TIMEOUT_CODES: ReadonlySet<string> = new Set([
  // ethers, when its own request timeout fires.
  'TIMEOUT',
  // Node, when a socket times out.
  'ETIMEDOUT',
]);

/**
 * How many errors are inspected at most. A cause chain is a few links long in
 * practice; the cap keeps a circular or very wide chain from being walked
 * without end.
 */
const MAX_ERRORS_INSPECTED = 16;

interface ErrorLike {
  code?: unknown;
  info?: {responseStatus?: unknown};
  response?: {statusCode?: unknown};
  cause?: unknown;
  error?: unknown;
  errors?: unknown;
}

/**
 * Turns the error a provider check failed with into the short code that
 * `/health` reports.
 *
 * Looks at the error and at the errors it wraps: `cause`, ethers' `error`, and
 * the `errors` of an `AggregateError`, which Node raises when every address of
 * a host refuses the connection. The first link that means something decides.
 *
 * @param err - What the check rejected with.
 * @returns The reason code; `error` when nothing more specific applies.
 */
export function failureReason(err: unknown): HealthFailureReason {
  if (err instanceof ProviderCheckFailure) {
    return err.reason;
  }
  const queue: unknown[] = [err];
  const seen = new Set<unknown>();
  while (queue.length > 0 && seen.size < MAX_ERRORS_INSPECTED) {
    const current = queue.shift();
    if (current && typeof current === 'object' && !seen.has(current)) {
      seen.add(current);
      const reason = reasonOfLink(current as ErrorLike);
      if (reason) {
        return reason;
      }
      const {cause, error, errors} = current as ErrorLike;
      queue.push(cause, error, ...(Array.isArray(errors) ? errors : []));
    }
  }
  return 'error';
}

/**
 * The reason one error in the chain points to, from its own code and HTTP
 * status, if any. The errors it wraps are the caller's to walk.
 */
function reasonOfLink(link: ErrorLike): HealthFailureReason | undefined {
  if (link instanceof ProviderTimeoutError) {
    return 'timeout';
  }
  if (link instanceof ProviderHttpStatusError) {
    return link.statusCode >= 500 ? 'http_5xx' : undefined;
  }
  if (typeof link.code !== 'string') {
    return undefined;
  }
  if (link.code === 'ECONNREFUSED') {
    return 'refused';
  }
  if (TIMEOUT_CODES.has(link.code)) {
    return 'timeout';
  }
  // ethers raises SERVER_ERROR for any non-2xx HTTP answer. A 4xx is our
  // request being wrong, not the provider failing, so only 5xx counts.
  if (link.code === 'SERVER_ERROR' && httpStatus(link) >= 500) {
    return 'http_5xx';
  }
  return undefined;
}

/**
 * The HTTP status of an ethers SERVER_ERROR, or `0` when it has none.
 *
 * ethers keeps the number on `response.statusCode` and a display string such
 * as "502 Bad Gateway" on `info.responseStatus`; the string is the fallback.
 */
function httpStatus(link: ErrorLike): number {
  const statusCode = link.response?.statusCode;
  if (typeof statusCode === 'number') {
    return statusCode;
  }
  const responseStatus = link.info?.responseStatus;
  return typeof responseStatus === 'string' ? parseInt(responseStatus, 10) || 0 : 0;
}
