import {ProviderHealthReport} from '../../models/provider-health-report.model';
import {ProviderHealthStore} from './provider-health.store';

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
