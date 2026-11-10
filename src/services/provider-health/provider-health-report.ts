import {ProviderHealthReport} from '../../models/provider-health-report.model';
import {HEALTH_FAILURE_REASONS} from './provider-health-check';
import {ProviderHealthStore} from './provider-health.store';

/**
 * OpenAPI schema of one {@link ProviderHealthReport}, for the routes that
 * return it.
 */
export const PROVIDER_HEALTH_REPORT_SCHEMA = {
  type: 'object',
  required: ['provider', 'status', 'reason', 'latencyMs', 'checkedAt', 'since'],
  properties: {
    provider: {type: 'string', example: 'powpeg'},
    status: {type: 'string', enum: ['up', 'down']},
    reason: {
      type: 'string',
      nullable: true,
      enum: [...HEALTH_FAILURE_REASONS, null],
      description: 'Why the provider is down; null while it is up',
    },
    latencyMs: {type: 'integer', description: 'How long the last check took'},
    checkedAt: {type: 'string', format: 'date-time'},
    since: {type: 'string', format: 'date-time', description: 'When the status last changed'},
  },
};

/**
 * Every stored provider health, in the shape the routes return.
 *
 * Reads the store only, so it never contacts a provider.
 *
 * @param store - The process-wide provider health store.
 * @returns One report per provider, sorted by key; empty until the first
 * check ends.
 */
export function providerHealthReports(store: ProviderHealthStore): ProviderHealthReport[] {
  return store.list().map(entry => ({
    provider: entry.provider,
    status: entry.status,
    reason: entry.reason,
    latencyMs: entry.durationMs,
    checkedAt: entry.checkedAt.toISOString(),
    since: entry.since.toISOString(),
  }));
}
