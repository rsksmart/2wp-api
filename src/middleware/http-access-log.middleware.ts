import {randomBytes} from 'crypto';
import {Next} from '@loopback/core';
import {Middleware, MiddlewareContext, Request, Response} from '@loopback/rest';
import {
  MAX_REQUEST_DURATION_MS,
  REQUEST_DEADLINE_GRACE_MS,
} from '../config/resource-budgets';
import {writeBoundedError} from './bounded-error-writer';
import {getLogger} from '../utils/logger';
import {
  CancellationReason,
  recordCancellation,
  RequestCancelledError,
} from '../utils/request-cancellation';
import {runWithRequestContext} from '../utils/trace-context';

const logger = getLogger('http-access');

const REQUEST_ID_HEADER = 'X-Request-Id';
const MAX_CORRELATION_ID_LENGTH = 128;
const SAFE_CORRELATION_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;

const STATIC_PATHS = new Set<string>([
  '/',
  '/index.html',
  '/favicon.ico',
  '/openapi.json',
  '/openapi.yaml',
]);
const STATIC_PATH_PREFIXES = ['/explorer'];

// Probes poll this every few seconds.
const HEALTH_PATH = '/health';

const isRoutineHealthProbe = (request: Request, response: Response): boolean =>
  request.path === HEALTH_PATH &&
  response.writableFinished &&
  response.statusCode < 400;

const isApiRequest = (path: string): boolean => {
  if (STATIC_PATHS.has(path)) {
    return false;
  }
  return !STATIC_PATH_PREFIXES.some(
    prefix => path === prefix || path.startsWith(`${prefix}/`),
  );
};

const isSafeCorrelationId = (value: string): boolean =>
  value.length <= MAX_CORRELATION_ID_LENGTH && SAFE_CORRELATION_ID_PATTERN.test(value);

const firstValidCorrelationIdHeader = (
  request: Request,
  ...names: string[]
): string | undefined =>
  names
    .map(name => request.get(name)?.trim())
    .find((value) => !!value && isSafeCorrelationId(value));

// Extract the trace-id segment from a W3C traceparent header
const extractTraceparentId = (traceparent?: string): string | null => {
  if (!traceparent) {
    return null;
  }
  const segments = traceparent.trim().split('-');
  if (segments.length < 4) {
    return null;
  }
  const traceId = segments[1];
  if (!/^[0-9a-f]{32}$/i.test(traceId) || /^0+$/.test(traceId)) {
    return null;
  }
  return traceId;
};

// Prefer an inbound trace id, then a request id, otherwise generate one so
// every logged request can be correlated.
const resolveTraceId = (request: Request): string => {
  const traceparentId = extractTraceparentId(request.get('traceparent'));
  if (traceparentId) {
    return traceparentId;
  }
  const traceId = firstValidCorrelationIdHeader(request, 'x-trace-id', 'traceid');
  if (traceId) {
    return traceId;
  }
  const requestId = firstValidCorrelationIdHeader(request, 'x-request-id');
  if (requestId) {
    return requestId;
  }

  return randomBytes(16).toString('hex');
};

export const httpAccessLogMiddleware: Middleware = async (
  ctx: MiddlewareContext,
  next: Next,
) => {
  const {request, response} = ctx;
  const traceId = resolveTraceId(request);
  const startedAt = Date.now();

  if (!response.headersSent) {
    response.setHeader(REQUEST_ID_HEADER, traceId);
  }

  // One controller per request, tripped when nobody is waiting for the answer
  // any more. Downstream work reads it via the request context rather than
  // having it threaded through every signature.
  const controller = new AbortController();
  const elapsed = () => Date.now() - startedAt;
  const route = `${request.method} ${request.path}`;

  const cancel = (reason: CancellationReason) => {
    if (controller.signal.aborted) {
      return;
    }
    // Abort with the reason attached, so everything downstream reports why the
    // work stopped rather than assuming.
    controller.abort(new RequestCancelledError(reason));
    recordCancellation({
      reason,
      route,
      elapsedMs: elapsed(),
      configuredLimitMs: reason === 'timeout' ? MAX_REQUEST_DURATION_MS : undefined,
    });

    // Aborting the signal only reaches work that observes it. `web3`, `ethers`,
    // `mongoose` and the REST connector do not, so without this the deadline
    // marks a request as over while the connection stays open with no response —
    // indistinguishable, from the client's side, from a hung service.
    //
    // Deliberately not done for `client_aborted`: nobody is listening, and 499
    // is documented as logged-never-delivered.
    if (reason === 'timeout') {
      const grace = setTimeout(() => {
        // `writeBoundedError` owns every guard here: it declines a response that
        // already ended or was destroyed, and drops the connection when headers
        // are already on the wire.
        runWithRequestContext({traceId, signal: controller.signal}, () =>
          writeBoundedError(request, response, new RequestCancelledError(reason)),
        );
      }, REQUEST_DEADLINE_GRACE_MS);
      grace.unref();
      response.once('close', () => clearTimeout(grace));
    }
  };

  // `unref` so a pending deadline cannot hold the process open at shutdown.
  const deadline = setTimeout(() => cancel('timeout'), MAX_REQUEST_DURATION_MS);
  deadline.unref();

  // 'close' fires on success and on abort alike; `writableFinished` is what
  // distinguishes them. `writableEnded` is not usable here — it flips to true
  // even for a response the client never received, and `req.on('aborted')` has
  // been documentation-deprecated since Node 17.
  response.once('close', () => {
    clearTimeout(deadline);
    if (!response.writableFinished) {
      cancel('client_aborted');
    }
  });

  // Run the rest of the request within a request context so every log line
  // emitted by downstream controllers and services carries the traceId, and so
  // they can observe cancellation.
  return runWithRequestContext({traceId, signal: controller.signal}, () => {
    if (isApiRequest(request.path)) {
      // 'close' rather than 'finish': 'finish' never fires for an abandoned
      // request, which is precisely the case worth having in the log.
      response.once('close', () => {
        if (isRoutineHealthProbe(request, response)) {
          return;
        }
        logger.info(
          {
            httpMethod: request.method,
            httpPath: request.path,
            httpStatusCode: response.statusCode,
            durationMs: elapsed(),
            completed: response.writableFinished,
            userAgent: request.get('user-agent'),
            traceId,
          },
          response.writableFinished
            ? 'HTTP request completed'
            : 'HTTP request abandoned by client',
        );
      });
    }

    return next();
  });
};
