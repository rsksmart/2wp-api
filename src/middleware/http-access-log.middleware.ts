import {randomBytes} from 'crypto';
import {Next} from '@loopback/core';
import {Middleware, MiddlewareContext, Request} from '@loopback/rest';
import {getLogger} from '../utils/logger';

const logger = getLogger('http-access');

const REQUEST_ID_HEADER = 'X-Request-Id';

const STATIC_PATHS = new Set<string>([
  '/',
  '/index.html',
  '/favicon.ico',
  '/openapi.json',
  '/openapi.yaml',
]);
const STATIC_PATH_PREFIXES = ['/explorer'];

const isApiRequest = (path: string): boolean => {
  if (STATIC_PATHS.has(path)) {
    return false;
  }
  return !STATIC_PATH_PREFIXES.some(
    prefix => path === prefix || path.startsWith(`${prefix}/`),
  );
};

const firstNonEmptyHeader = (
  request: Request,
  ...names: string[]
): string | undefined =>
  names.map(name => request.get(name)?.trim()).find(value => !!value);

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
const resolveRequestId = (request: Request): string => {
  const traceparentId = extractTraceparentId(request.get('traceparent'));
  if (traceparentId) {
    return traceparentId;
  }
  const traceId = firstNonEmptyHeader(request, 'x-trace-id', 'traceid');
  if (traceId) {
    return traceId;
  }
  const requestId = firstNonEmptyHeader(request, 'x-request-id');
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
  const requestId = resolveRequestId(request);

  if (!response.headersSent) {
    response.setHeader(REQUEST_ID_HEADER, requestId);
  }

  if (isApiRequest(request.path)) {
    const startedAt = Date.now();
    response.once('finish', () => {
      logger.info(
        {
          httpMethod: request.method,
          httpPath: request.path,
          httpStatusCode: response.statusCode,
          durationMs: Date.now() - startedAt,
          userAgent: request.get('user-agent'),
          requestId,
        },
        'HTTP request completed',
      );
    });
  }

  return next();
};
