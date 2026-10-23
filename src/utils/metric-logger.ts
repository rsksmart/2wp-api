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

/**
 * Gauges, kept separate from counters because they move in both directions.
 * Counters only ever climb, so a single map could not represent "how many are
 * in flight right now" — the value plan 05 actually needs.
 */
const gauges = new Map<string, number>();

/**
 * Sets a gauge to an absolute value.
 *
 * @param logger - Logger used to emit the sample.
 * @param name - Gauge name, e.g. `provider_permits_active`.
 * @param value - The current value.
 * @param labels - Optional low-cardinality labels.
 * @returns The value that was set.
 */
export const setMetricGauge = (
  logger: Logger,
  name: string,
  value: number,
  labels?: MetricLabels,
): number => {
  const key = counterKey(name, labels);
  gauges.set(key, value);
  if (metricsEnabled()) {
    logger.debug({metric: name, metricType: 'gauge', ...labels, value});
  }
  return value;
};

/**
 * Moves a gauge by `by`, which may be negative.
 *
 * Clamped at zero: these gauges count things that exist, and a negative count
 * would mean a bookkeeping bug had silently corrupted the signal rather than
 * showing up as a stuck-at-zero one.
 *
 * @param logger - Logger used to emit the sample.
 * @param name - Gauge name.
 * @param by - Delta to apply.
 * @param labels - Optional low-cardinality labels.
 * @returns The gauge's new value.
 */
export const adjustMetricGauge = (
  logger: Logger,
  name: string,
  by: number,
  labels?: MetricLabels,
): number => {
  const key = counterKey(name, labels);
  const next = Math.max(0, (gauges.get(key) ?? 0) + by);
  return setMetricGauge(logger, name, next, labels);
};

/**
 * Reads a gauge.
 *
 * @param name - Gauge name.
 * @param labels - Labels the sample was recorded with.
 * @returns The current value, or `0` if never set.
 */
export const getMetricGauge = (name: string, labels?: MetricLabels): number =>
  gauges.get(counterKey(name, labels)) ?? 0;

/** Snapshot of every gauge, keyed the same way as counters. */
export const getMetricGauges = (): Record<string, number> =>
  Object.fromEntries(gauges);

/** Clears every counter and gauge. Intended for tests. */
export const resetMetricCounters = (): void => {
  counters.clear();
  gauges.clear();
};
