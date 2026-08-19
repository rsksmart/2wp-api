import {HttpErrors} from '@loopback/rest';
import {
  ProviderResponseTooLargeError,
  ProviderTimeoutError,
} from './bounded-http-client';
import {getLogger} from './logger';

const logger = getLogger('provider-error');

/**
 * Translates a bounded-HTTP-client failure into a bounded HTTP error.
 *
 * The returned error never carries provider or request payload — only the
 * failure class — so an oversized or hostile provider response can't be
 * reflected to the caller. Budget violations were already recorded by the
 * client, so this does not emit a second observability signal.
 *
 * @param err - The error thrown by the bounded HTTP client.
 * @param ctx - Provider operation and (optionally) the route being served, for logs.
 * @returns The HTTP error to throw.
 */
export function toHttpProviderError(
  err: unknown,
  ctx: {operation: string; route?: string},
): HttpErrors.HttpError {
  logger.warn(
    {method: 'toHttpProviderError', ...ctx, err: err as Error},
    'Provider request failed',
  );

  if (err instanceof ProviderResponseTooLargeError) {
    return new HttpErrors.BadGateway(
      'Provider response exceeded the configured size budget',
    );
  }
  if (err instanceof ProviderTimeoutError) {
    return new HttpErrors.GatewayTimeout(
      'Provider request exceeded the configured time budget',
    );
  }
  // Everything else — a non-2xx status, a malformed response, a network failure,
  // or an unexpected error — collapses to the same bounded 502. The failure
  // class stays in the log above; the response says nothing more.
  return new HttpErrors.BadGateway(`Provider request failed: ${ctx.operation}`);
}
