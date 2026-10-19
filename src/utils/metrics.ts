import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  Registry,
} from '@prometheus-io/client';

const packageJson = require('../../package.json');

export const METRICS_PREFIX = 'twp_api_';

export const metricsRegistry = new Registry();

metricsRegistry.setDefaultLabels({
  environment: process.env.DEPLOY_ENV ?? 'local',
});

new Gauge({
  name: `${METRICS_PREFIX}up`,
  help: 'Whether the 2wp-api process is serving; always 1 while it can be scraped.',
  registers: [metricsRegistry],
}).set(1);

new Gauge({
  name: `${METRICS_PREFIX}info`,
  help: 'Build information of the running 2wp-api process; always 1.',
  labelNames: ['version', 'node_version'],
  registers: [metricsRegistry],
}).set(
  {
    version: packageJson.version,
    node_version: process.version,
  },
  1,
);

// Closed so `errors_total` stays low-cardinality: never derived from request data.
export const ERROR_TYPES = [
  'validation',
  'rejected',
  'rate_limited',
  'cancelled',
  'overloaded',
  'timeout',
  'upstream',
  'internal',
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

export const errorsTotal = new Counter<'type'>({
  name: `${METRICS_PREFIX}errors_total`,
  help: 'Requests answered with an error, by error type.',
  labelNames: ['type'],
  registers: [metricsRegistry],
});

// A series that does not exist yet cannot be alerted on, and its first error
// would be lost to `rate()`.
ERROR_TYPES.forEach(type => errorsTotal.inc({type}, 0));

export const httpRequestsTotal = new Counter<'method' | 'path' | 'status'>({
  name: `${METRICS_PREFIX}http_requests_total`,
  help: 'HTTP requests handled, by method, route template and status code.',
  labelNames: ['method', 'path', 'status'],
  registers: [metricsRegistry],
});

// Topped at the request deadline (30 s): past it the deadline answers, not the handler.
export const httpRequestDurationSeconds = new Histogram<'method' | 'path'>({
  name: `${METRICS_PREFIX}http_request_duration_seconds`,
  help: 'HTTP request duration in seconds, by method and route template.',
  labelNames: ['method', 'path'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [metricsRegistry],
});

export const httpRequestsInFlight = new Gauge({
  name: `${METRICS_PREFIX}http_requests_in_flight`,
  help: 'HTTP requests currently being handled.',
  registers: [metricsRegistry],
});

collectDefaultMetrics({register: metricsRegistry, prefix: METRICS_PREFIX});
