import {Next} from '@loopback/core';
import {
  Middleware,
  MiddlewareContext,
  OpenApiSpec,
  OperationObject,
} from '@loopback/rest';
import {METRICS_PATH} from '../controllers/metrics.controller';
import {
  httpRequestDurationSeconds,
  httpRequestsInFlight,
  httpRequestsTotal,
} from '../utils/metrics';
import {resolveRouteTemplate} from '../utils/route-template';
import {isApiRequest} from './http-access-log.middleware';

const UNMATCHED_ROUTE = 'unmatched';
// A matched route bounds its methods; an unmatched one would take any the parser accepts.
const UNMATCHED_METHOD = 'OTHER';

// The scrape is excluded so the metrics describe the API, not the scraper.
const isMeteredPath = (path: string): boolean =>
  isApiRequest(path) && path !== METRICS_PATH;

export const httpMetricsMiddleware: Middleware = async (
  ctx: MiddlewareContext,
  next: Next,
) => {
  const {request, response} = ctx;
  if (!isApiRequest(request.path)) {
    return next();
  }

  // The route template, never the raw path: paths carry addresses and txids.
  const template = await resolveRouteTemplate(ctx);
  if (template === METRICS_PATH) {
    return next();
  }
  const path = template ?? UNMATCHED_ROUTE;
  const method = template ? request.method : UNMATCHED_METHOD;
  const stopTimer = httpRequestDurationSeconds.startTimer({method, path});
  httpRequestsInFlight.inc();
  response.once('close', () => {
    httpRequestsInFlight.dec();
    // An abandoned response was never delivered, whatever status it carried.
    const status = response.writableFinished ? response.statusCode : 499;
    httpRequestsTotal.inc({method, path, status: String(status)});
    stopTimer();
  });

  return next();
};

/**
 * Starts the series of every documented route and status at 0. Without this a
 * series does not exist until its first request, so a fresh process exposes no
 * labels to check or alert on.
 */
export function seedHttpMetrics(spec: OpenApiSpec): void {
  Object.entries(spec.paths)
    .filter(([path]) => isMeteredPath(path))
    .forEach(([path, operations]) =>
      Object.entries(operations as Record<string, OperationObject>).forEach(
        ([verb, operation]) => {
          const labels = {method: verb.toUpperCase(), path};
          httpRequestDurationSeconds.zero(labels);
          Object.keys(operation.responses ?? {})
            .filter(status => /^[1-5]\d\d$/.test(status))
            .forEach(status => httpRequestsTotal.inc({...labels, status}, 0));
        },
      ),
    );
}
