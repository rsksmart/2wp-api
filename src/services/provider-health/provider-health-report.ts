import {
  LiquidityProviderHealthReport,
  ProviderHealthReport,
} from '../../models/provider-health-report.model';
import {ProviderHealthStore} from './provider-health.store';
import {ProviderHealthState} from './status-rules';

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
  return store.list().map(entry => {
    const report: ProviderHealthReport = {provider: entry.provider, ...stateReport(entry)};
    if (entry.liquidityProviders) {
      report.liquidityProviders = entry.liquidityProviders.map(
        (lp): LiquidityProviderHealthReport => ({id: lp.id, name: lp.name, ...stateReport(lp)}),
      );
    }
    return report;
  });
}

function stateReport(state: ProviderHealthState) {
  return {
    status: state.status,
    reason: state.reason,
    latencyMs: state.durationMs,
    checkedAt: state.checkedAt.toISOString(),
    since: state.since.toISOString(),
  };
}
