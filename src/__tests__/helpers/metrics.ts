import {Counter, Gauge, MetricValue} from '@prometheus-io/client';
import {FORMAT_REJECTED_METRIC} from '../../middleware/bounded-error-writer';
import {RATE_LIMIT_REJECTED_METRIC} from '../../middleware/rate-limit.middleware';
import {metricsRegistry} from '../../utils/metrics';
import {
  PROVIDER_PERMITS_ACTIVE_GAUGE,
  PROVIDER_PERMITS_GRANTED_METRIC,
  PROVIDER_PERMITS_QUEUED_GAUGE,
  PROVIDER_PERMITS_REJECTED_METRIC,
} from '../../utils/provider-permits';
import {REQUEST_CANCELLED_METRIC} from '../../utils/request-cancellation';
import {RESOURCE_BUDGET_EXCEEDED_METRIC} from '../../utils/resource-budget';

type Labels = Record<string, string | number>;

const metricNamed = (name: string) =>
  metricsRegistry.getSingleMetric(name) as Counter<string> | Gauge<string>;

const samplesOf = async (name: string): Promise<MetricValue<string>[]> =>
  (await metricNamed(name).get()).values;

// The registry writes its default labels into the samples it serializes, so a
// sample read after a scrape carries labels its metric never declared.
const ownLabels = (
  labels: Partial<Labels> = {},
): Labels => {
  const {environment, ...own} = labels;
  return own as Labels;
};

const sameLabels = (a: Labels, b: Labels): boolean =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.keys(a).every(key => String(a[key]) === String(b[key]));

const read = async (name: string, labels: Labels = {}): Promise<number> =>
  (await samplesOf(name)).find(sample =>
    sameLabels(ownLabels(sample.labels), labels),
  )?.value ?? 0;

/** Reads one counter series, or `0` if it does not exist. */
export const getMetricCounter = read;

/** Reads one gauge series, or `0` if it does not exist. */
export const getMetricGauge = read;

/**
 * Zeroes the metrics the suites assert on, keeping every series that existed.
 * A plain `reset()` would drop the series seeded at startup.
 */
export const resetMetricCounters = async (): Promise<void> => {
  await Promise.all(
    [
      RESOURCE_BUDGET_EXCEEDED_METRIC,
      FORMAT_REJECTED_METRIC,
      RATE_LIMIT_REJECTED_METRIC,
      REQUEST_CANCELLED_METRIC,
      PROVIDER_PERMITS_ACTIVE_GAUGE,
      PROVIDER_PERMITS_QUEUED_GAUGE,
      PROVIDER_PERMITS_GRANTED_METRIC,
      PROVIDER_PERMITS_REJECTED_METRIC,
    ].map(async name => {
      const metric = metricNamed(name);
      const series = (await samplesOf(name)).map(({labels}) => ownLabels(labels));
      metric.reset();
      series.forEach(labels =>
        metric instanceof Gauge ? metric.set(labels, 0) : metric.inc(labels, 0),
      );
    }),
  );
};
