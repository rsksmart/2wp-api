import {expect} from '@loopback/testlab';
import mongoose from 'mongoose';
import {
  FORMAT_REJECTION_REASONS,
  recordFormatRejection,
} from '../../../middleware/bounded-error-writer';
import {RATE_LIMIT_ROUTE_CLASSES} from '../../../middleware/rate-limit.middleware';
import {ERROR_TYPES, METRICS_PREFIX, metricsRegistry} from '../../../utils/metrics';
import {
  blockbookPermits,
  PERMIT_REJECTION_REASONS,
  txProviderPermits,
} from '../../../utils/provider-permits';
import {
  CANCELLATION_REASONS,
  recordCancellation,
} from '../../../utils/request-cancellation';
import {
  recordBudgetViolation,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

const MARKER = 'MARKER_LABEL_LEAK';

/**
 * Every label of every custom metric, with the only values it may take. Request
 * data is attacker-controlled and unbounded: a label carrying it would be both a
 * cardinality explosion and a leak into the metrics pipeline.
 */
const vocabularies = (): Record<string, Record<string, readonly string[]>> => {
  const pool = [blockbookPermits.name, txProviderPermits.name];
  const collection = mongoose
    .modelNames()
    .map(name => mongoose.model(name).collection.collectionName);
  return {
    [`${METRICS_PREFIX}errors_total`]: {type: ERROR_TYPES},
    [`${METRICS_PREFIX}http_format_rejected_total`]: {
      reason: FORMAT_REJECTION_REASONS,
    },
    [`${METRICS_PREFIX}rate_limit_rejected_total`]: {
      route_class: RATE_LIMIT_ROUTE_CLASSES,
    },
    [`${METRICS_PREFIX}requests_cancelled_total`]: {
      reason: CANCELLATION_REASONS,
    },
    [`${METRICS_PREFIX}resource_budget_exceeded_total`]: {
      resource: Object.values(ResourceBudgetName),
    },
    [`${METRICS_PREFIX}provider_permits_active`]: {pool},
    [`${METRICS_PREFIX}provider_permits_queued`]: {pool},
    [`${METRICS_PREFIX}provider_permits_granted_total`]: {pool},
    [`${METRICS_PREFIX}provider_permits_rejected_total`]: {
      pool,
      reason: PERMIT_REJECTION_REASONS,
    },
    [`${METRICS_PREFIX}mongo_operation_duration_seconds`]: {
      operation: ['set'],
      collection,
    },
  };
};

// Added by the registry or by the histogram itself, never by the emitter.
const STRUCTURAL_LABELS = new Set(['environment', 'le']);

describe('Utils: metric label vocabularies', () => {
  before(() => {
    recordFormatRejection(
      Object.assign(new Error(MARKER), {
        statusCode: 415,
        type: 'encoding.unsupported',
        encoding: MARKER,
      }),
    );
    recordBudgetViolation({
      resource: ResourceBudgetName.RATE_LIMIT,
      configuredLimit: 1,
      observedValue: 2,
      route: MARKER,
      detail: MARKER,
    });
    recordCancellation({
      reason: 'timeout',
      route: MARKER,
      elapsedMs: 2,
      configuredLimitMs: 1,
    });
  });

  it('exposes no request data and only declared label values', async () => {
    expect(await metricsRegistry.metrics()).to.not.match(new RegExp(MARKER));

    const allowed = vocabularies();
    const metrics = await metricsRegistry.getMetricsAsJSON();

    metrics
      .filter(({name}) => allowed[name])
      .forEach(({name, values}) =>
        values.forEach(({labels}) =>
          Object.entries(labels)
            .filter(([label]) => !STRUCTURAL_LABELS.has(label))
            .forEach(([label, value]) => {
              expect(allowed[name]).to.have.property(label);
              expect(allowed[name][label]).to.containEql(String(value));
            }),
        ),
      );
  });
});
