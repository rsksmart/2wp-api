import {Logger} from './logger';

const getTime = () => (new Date()).getTime();

export const getMetricLogger = (logger: Logger, method: string) => {
  const start = getTime();
  return () => {
    if (process.env.METRICS_ENABLED?.toLowerCase() === 'true') {
      const durationMs = getTime() - start;
      logger.debug({method, durationMs});
    }
  };
};

/** Labels attached to a counter sample. Values must be low-cardinality. */
export type MetricLabels = Record<string, string | number>;

/**
 * Process-local monotonic counters, keyed by name plus serialized labels.
 * Kept in memory so they can be asserted in tests and, later, scraped by
 * whatever metrics exporter the service adopts.
 */
const counters = new Map<string, number>();

const metricsEnabled = (): boolean =>
  process.env.METRICS_ENABLED?.toLowerCase() === 'true';

/**
 * Builds the canonical `name{label="value",...}` key for a counter sample.
 * Labels are sorted so the same label set always maps to the same key.
 */
const counterKey = (name: string, labels?: MetricLabels): string => {
  if (!labels) {
    return name;
  }
  const entries = Object.entries(labels)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key}="${value}"`);
  return entries.length === 0 ? name : `${name}{${entries.join(',')}}`;
};

/**
 * Increments a process-local counter and, when `METRICS_ENABLED=true`, emits it
 * on the existing metric debug-log channel.
 *
 * Counters are always updated (they are cheap and in-memory); only the log
 * emission is gated, matching {@link getMetricLogger}.
 *
 * @param logger - Logger used to emit the metric sample.
 * @param name - Counter name, e.g. `resource_budget_exceeded_total`.
 * @param labels - Optional low-cardinality labels.
 * @param by - Increment amount. Defaults to `1`.
 * @returns The counter's new value.
 */
export const incrementMetricCounter = (
  logger: Logger,
  name: string,
  labels?: MetricLabels,
  by = 1,
): number => {
  const key = counterKey(name, labels);
  const value = (counters.get(key) ?? 0) + by;
  counters.set(key, value);
  if (metricsEnabled()) {
    logger.debug({metric: name, metricType: 'counter', ...labels, value});
  }
  return value;
};

/**
 * Snapshot of every counter recorded so far, keyed by
 * `name{label="value",...}`.
 *
 * @returns A copy of the counter registry.
 */
export const getMetricCounters = (): Record<string, number> =>
  Object.fromEntries(counters);

/**
 * Reads a single counter.
 *
 * @param name - Counter name.
 * @param labels - Labels the sample was recorded with.
 * @returns The current value, or `0` if never incremented.
 */
export const getMetricCounter = (name: string, labels?: MetricLabels): number =>
  counters.get(counterKey(name, labels)) ?? 0;

/** Clears every counter. Intended for tests. */
export const resetMetricCounters = (): void => {
  counters.clear();
};
