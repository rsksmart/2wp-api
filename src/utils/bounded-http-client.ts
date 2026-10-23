/* eslint-disable max-classes-per-file -- the error classes below are one
   concept: the failure modes this client can raise. Splitting the taxonomy
   across files would only make the classification harder to read. */
import http from 'http';
import https from 'https';
import {URL} from 'url';
import {
  MAX_PROVIDER_RESPONSE_BYTES,
  PROVIDER_MAX_RETRIES,
  PROVIDER_RETRY_BASE_DELAY_MS,
  PROVIDER_TIMEOUT_MS,
} from '../config/resource-budgets';
import {getLogger} from './logger';
import {blockbookPermits, Semaphore} from './provider-permits';
import {cancellationOf, RequestCancelledError} from './request-cancellation';
import {recordBudgetViolation, ResourceBudgetName} from './resource-budget';
import {getRequestSignal} from './trace-context';

const logger = getLogger('bounded-http-client');

/** Base class for every failure raised by {@link fetchJsonWithBudget}. */
export class BoundedHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * The provider response exceeded `maxResponseBytes`. Raised either from the
 * declared `Content-Length` (before a single body byte is buffered) or from the
 * running byte tally while streaming, at which point the socket is destroyed.
 */
export class ProviderResponseTooLargeError extends BoundedHttpError {
  constructor(
    readonly observedBytes: number,
    readonly limitBytes: number,
  ) {
    super(
      `Provider response exceeds the configured budget of ${limitBytes} bytes ` +
        `(observed at least ${observedBytes} bytes)`,
    );
  }
}

/** The provider did not complete the response within `timeoutMs`. */
export class ProviderTimeoutError extends BoundedHttpError {
  constructor(readonly timeoutMs: number) {
    super(`Provider request timed out after ${timeoutMs} ms`);
  }
}

/** The provider answered with a non-2xx status. Redirects are not followed. */
export class ProviderHttpStatusError extends BoundedHttpError {
  constructor(readonly statusCode: number) {
    super(`Provider responded with HTTP ${statusCode}`);
  }
}

/** The provider answered with something that is not the expected JSON. */
export class ProviderInvalidResponseError extends BoundedHttpError {}

/** The request never reached the provider (DNS, TCP, TLS). */
export class ProviderNetworkError extends BoundedHttpError {}

/** A bounded GET-for-JSON against a downstream provider. */
export interface BoundedJsonRequest {
  /** Absolute `http:`/`https:` URL to fetch. */
  url: string;
  /**
   * Short, low-cardinality label for the provider operation, e.g.
   * `blockbook.utxo`. Used in logs and metric labels only.
   */
  operation: string;
  /** Route or internal operation on whose behalf the call is made. */
  route?: string;
  /** Overall deadline in ms. Defaults to `PROVIDER_TIMEOUT_MS`. */
  timeoutMs?: number;
  /** Response ceiling in bytes. Defaults to `MAX_PROVIDER_RESPONSE_BYTES`. */
  maxResponseBytes?: number;
  /** Extra attempts after the first. Defaults to `PROVIDER_MAX_RETRIES`. */
  maxRetries?: number;
  /** Base backoff in ms. Defaults to `PROVIDER_RETRY_BASE_DELAY_MS`. */
  retryBaseDelayMs?: number;
  /** Extra request headers. `accept` is always forced to `application/json`. */
  headers?: Record<string, string>;
  /**
   * Pool the call takes a permit from. Defaults to the process-wide Blockbook
   * pool, which is the only provider reached through this client today.
   * Overridable so a test can exercise a pool it fully controls.
   */
  permits?: Semaphore;
}

const sleep = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/**
 * Transient failures worth one more attempt. Budget violations, malformed
 * responses and 4xx answers are never retried — retrying them would only
 * multiply the work an attacker gets for free.
 *
 * A cancellation is emphatically not retryable: nobody is waiting for the
 * answer, so retrying would do the very work cancellation exists to avoid. It is
 * checked first because it would otherwise be classified as a network failure,
 * which *is* retryable.
 */
export const isRetryableError = (err: unknown): boolean => {
  if (err instanceof RequestCancelledError) {
    return false;
  }
  if (err instanceof ProviderHttpStatusError) {
    return err.statusCode >= 500;
  }
  return (
    err instanceof ProviderTimeoutError || err instanceof ProviderNetworkError
  );
};

/**
 * Performs one bounded attempt. Resolves with the parsed JSON body, or rejects
 * with one of the {@link BoundedHttpError} subclasses.
 */
function attempt<T>(
  target: URL,
  timeoutMs: number,
  maxResponseBytes: number,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const transport = target.protocol === 'https:' ? https : http;
    let settled = false;
    // Declared before the request so `finish` can always clear it, even if the
    // request errors before the timer is armed.
    let deadline: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;

    const finish = (err: Error | null, value?: T) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(deadline);
      if (onAbort) {
        signal?.removeEventListener('abort', onAbort);
      }
      if (err) {
        reject(err);
      } else {
        resolve(value as T);
      }
    };

    const request = transport.request(
      target,
      {
        method: 'GET',
        headers: {
          ...headers,
          accept: 'application/json',
          // Node's own HTTP client neither asks for nor performs decompression,
          // so no decoder is reachable from a response on this path whatever the
          // upstream sends. Saying so explicitly stops an honest provider
          // spending CPU compressing a body we would only have to reject, and
          // records the property rather than leaving it to be re-derived from an
          // absence.
          'accept-encoding': 'identity',
        },
      },
      res => {
        // Settle first, then drop the response on the floor without buffering
        // it: destroying the socket can emit 'error'/'aborted' synchronously,
        // and the real reason must be the one that wins.
        const abortWith = (err: Error) => {
          finish(err);
          res.resume();
          res.destroy();
        };

        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          abortWith(new ProviderHttpStatusError(statusCode));
          return;
        }

        // Explicit JSON expectation: anything else is refused before parsing.
        const contentType = res.headers['content-type'];
        if (contentType && !/\bjson\b/i.test(contentType)) {
          abortWith(
            new ProviderInvalidResponseError(
              'Provider response is not declared as JSON',
            ),
          );
          return;
        }

        // Cheapest possible enforcement: reject on the declared size, before a
        // single body byte is buffered.
        const declaredLength = Number(res.headers['content-length']);
        if (
          Number.isFinite(declaredLength) &&
          declaredLength > maxResponseBytes
        ) {
          abortWith(
            new ProviderResponseTooLargeError(declaredLength, maxResponseBytes),
          );
          return;
        }

        let receivedBytes = 0;
        let chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > maxResponseBytes) {
            // Release what we already hold before unwinding, so an oversized
            // response never survives as retained heap.
            chunks = [];
            abortWith(
              new ProviderResponseTooLargeError(
                receivedBytes,
                maxResponseBytes,
              ),
            );
            return;
          }
          chunks.push(chunk);
        });

        res.on('aborted', () => {
          chunks = [];
          finish(
            new ProviderNetworkError(
              'Provider closed the connection before the response completed',
            ),
          );
        });

        res.on('error', (err: Error) => {
          chunks = [];
          finish(new ProviderNetworkError(err.message));
        });

        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          chunks = [];
          try {
            finish(null, JSON.parse(body) as T);
          } catch {
            finish(
              new ProviderInvalidResponseError(
                'Provider response body is not valid JSON',
              ),
            );
          }
        });
      },
    );

    deadline = setTimeout(() => {
      request.destroy(new ProviderTimeoutError(timeoutMs));
    }, timeoutMs);

    // Destroying the request with a typed error is the same path the deadline
    // uses, so the reason survives to the 'error' handler below and the
    // `settled` guard makes the two idempotent against each other.
    if (signal) {
      onAbort = () =>
        request.destroy(cancellationOf(signal) ?? new RequestCancelledError());
      signal.addEventListener('abort', onAbort, {once: true});
    }

    request.on('error', (err: Error) => {
      // A cancellation arrives here too: aborting destroys the request with the
      // cancellation as its reason. Wrapping it as a network failure would blame
      // the provider for a decision taken locally, turning a 499/503 into a 502
      // — visible only when no retry remains to re-check the signal.
      const preserve =
        err instanceof BoundedHttpError || err instanceof RequestCancelledError;
      finish(preserve ? err : new ProviderNetworkError(err.message));
    });

    request.end();
  });
}

/**
 * Fetches JSON from a downstream provider under explicit resource budgets.
 *
 * The LoopBack REST connector buffers a whole provider response before the
 * application sees it, so it cannot bound response size. This client is the
 * bounded replacement used on the high-risk Blockbook endpoints: it enforces a
 * per-attempt deadline, rejects on the declared `Content-Length`, aborts the
 * socket as soon as the streamed byte tally passes the budget, insists the
 * response is declared as JSON, and retries only transient failures a bounded
 * number of times.
 *
 * `timeoutMs` bounds one attempt, so the worst case across retries is
 * `(maxRetries + 1) * timeoutMs` plus backoff. The request-level deadline in
 * `httpAccessLogMiddleware` is what bounds the total, and it cancels through the
 * request signal rather than merely abandoning the promise.
 *
 * Every call also takes a permit from a process-wide pool before it opens a
 * socket. The per-request fan-out limit bounds one request; without the pool,
 * concurrent requests multiply it, so total provider work in flight — and the
 * response bytes buffered behind it — grows with inbound concurrency instead of
 * being capped. The permit is held across the retry loop and its backoff, which
 * is the honest definition of "in flight".
 *
 * Budget violations emit `event=resource_budget_exceeded` and bump the
 * `resource_budget_exceeded_total` counter before the error is thrown.
 *
 * @param req - The request plus its budgets. Unset budgets fall back to the configured defaults.
 * @returns The parsed JSON body.
 * @throws {ProviderResponseTooLargeError} If the response exceeds the byte budget.
 * @throws {ProviderTimeoutError} If the response does not complete within the deadline.
 * @throws {ProviderHttpStatusError} If the provider answers non-2xx (redirects included).
 * @throws {ProviderInvalidResponseError} If the response is not JSON.
 * @throws {ProviderNetworkError} If the request never completed.
 * @throws {PermitRejectedError} If the provider pool and its queue are both full.
 */
export async function fetchJsonWithBudget<T = unknown>(
  req: BoundedJsonRequest,
): Promise<T> {
  const timeoutMs = req.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const maxResponseBytes = req.maxResponseBytes ?? MAX_PROVIDER_RESPONSE_BYTES;
  const maxRetries = req.maxRetries ?? PROVIDER_MAX_RETRIES;
  const retryBaseDelayMs = req.retryBaseDelayMs ?? PROVIDER_RETRY_BASE_DELAY_MS;

  let target: URL;
  try {
    target = new URL(req.url);
  } catch {
    throw new ProviderNetworkError('Provider URL is not a valid absolute URL');
  }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    throw new ProviderNetworkError(
      `Unsupported provider URL protocol: ${target.protocol}`,
    );
  }

  const signal = getRequestSignal();

  // Malformed input is refused above without touching the pool: a permit is for
  // work that is about to occupy the provider, not for work that never starts.
  return (req.permits ?? blockbookPermits).run(async () => {
    let lastError: unknown;
    for (let tryNumber = 0; tryNumber <= maxRetries; tryNumber += 1) {
      // Checked before every attempt, so a cancellation that lands between
      // retries stops the loop instead of funding another round trip.
      const cancellation = cancellationOf(signal);
      if (cancellation) {
        throw cancellation;
      }
      try {
        return await attempt<T>(
          target,
          timeoutMs,
          maxResponseBytes,
          req.headers ?? {},
          signal,
        );
      } catch (err) {
        lastError = err;
        if (err instanceof ProviderResponseTooLargeError) {
          recordBudgetViolation({
            resource: ResourceBudgetName.PROVIDER_RESPONSE_BYTES,
            configuredLimit: err.limitBytes,
            observedValue: err.observedBytes,
            route: req.route,
            detail: req.operation,
          });
          throw err;
        }
        if (err instanceof ProviderTimeoutError) {
          recordBudgetViolation({
            resource: ResourceBudgetName.PROVIDER_TIMEOUT_MS,
            configuredLimit: err.timeoutMs,
            observedValue: err.timeoutMs,
            route: req.route,
            detail: req.operation,
          });
        }
        if (!isRetryableError(err) || tryNumber === maxRetries) {
          throw err;
        }
        logger.warn(
          {
            method: 'fetchJsonWithBudget',
            operation: req.operation,
            route: req.route,
            attempt: tryNumber + 1,
            maxAttempts: maxRetries + 1,
            err: err as Error,
          },
          'Retrying provider request',
        );
        await sleep(retryBaseDelayMs * 2 ** tryNumber);
      }
    }

    /* istanbul ignore next -- the loop always returns or throws */
    throw lastError;
  });
}
