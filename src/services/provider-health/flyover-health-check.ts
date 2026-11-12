import {ethers} from 'ethers';
import * as constants from '../../constants';
import {
  BoundedJsonRequest,
  fetchJsonWithBudget,
} from '../../utils/bounded-http-client';
import {failureReason} from './failure-reason';
import {
  HealthFailureReason,
  ProviderCheckFailure,
  ProviderHealthCheck,
} from './provider-health-check';
import {LiquidityProviderHealthEntry, ProviderHealthStore} from './provider-health.store';
import {CheckOutcome, nextState} from './status-rules';
import {withinTimeLimit} from './time-limit';

// From @rsksmart/flyover-sdk 1.9.1. The SDK itself breaks on our ethers v6.
export const FLYOVER_DISCOVERY_ADDRESSES: Readonly<Record<string, string>> = {
  [constants.NETWORK_MAINNET]: '0x9a48c6b18aa000d0bd35d55616bcc98ad3553e7a',
  [constants.NETWORK_TESTNET]: '0xE8610c632c4219b0245b39d5Cd216A31F491d919',
};

const DISCOVERY_ABI = [
  'function getProviders() view returns (tuple(uint256 id, address providerAddress, bool status, uint8 providerType, string name, string apiBaseUrl)[])',
];

// Discovery + one LP call must stay under the job's 10 s limit per check.
export const FLYOVER_DISCOVERY_TIMEOUT_MS = 4_000;

export const LIQUIDITY_PROVIDER_CHECK_TIMEOUT_MS = 5_000;

const MAX_LIQUIDITY_PROVIDER_HEALTH_BYTES = 16 * 1024;

export interface DiscoveredLiquidityProvider {
  id: bigint;
  name: string;
  /** Registered by the LP, so untrusted. */
  apiBaseUrl: string;
  /** Whether the LP is enabled. */
  status: boolean;
}

export interface DiscoveryContract {
  getProviders(): Promise<DiscoveredLiquidityProvider[]>;
}

type FetchJson = <T>(req: BoundedJsonRequest) => Promise<T>;

export function flyoverDiscoveryAddress(env = process.env): string | undefined {
  return (
    // `||`, not `??`: an empty variable, as .env templates leave it, means unset.
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    env.FLYOVER_DISCOVERY_ADDRESS ||
    FLYOVER_DISCOVERY_ADDRESSES[env.NETWORK ?? constants.NETWORK_TESTNET]
  );
}

export function flyoverDiscoveryContract(
  provider: ethers.Provider,
  address: string | undefined,
): DiscoveryContract | undefined {
  return address
    ? (new ethers.Contract(address, DISCOVERY_ABI, provider) as unknown as DiscoveryContract)
    : undefined;
}

/**
 * Flyover is up while at least one enabled LP is healthy, since the UI can then
 * still get a quote.
 */
export class FlyoverHealthCheck implements ProviderHealthCheck {
  readonly provider = 'flyover';
  private lastDiscovered?: DiscoveredLiquidityProvider[];

  constructor(
    private readonly discovery: DiscoveryContract | undefined,
    private readonly store: ProviderHealthStore,
    private readonly fetchJson: FetchJson = fetchJsonWithBudget,
  ) {}

  async check(): Promise<void> {
    const liquidityProviders = (await this.discover()).filter(lp => lp.status);
    if (liquidityProviders.length === 0) {
      this.store.setLiquidityProviders(this.provider, []);
      throw new ProviderCheckFailure(
        'no_capacity',
        'No enabled Flyover liquidity provider is registered',
      );
    }

    const outcomes = await Promise.all(
      liquidityProviders.map(lp => this.checkLiquidityProvider(lp)),
    );
    this.storeLiquidityProviders(liquidityProviders, outcomes);

    if (outcomes.some(outcome => outcome.reason === null)) {
      return;
    }
    const reasons = new Set(outcomes.map(outcome => outcome.reason));
    const reason: HealthFailureReason =
      reasons.size === 1 ? (outcomes[0].reason ?? 'error') : 'error';
    throw new ProviderCheckFailure(
      reason,
      `None of the ${liquidityProviders.length} Flyover liquidity providers is healthy`,
    );
  }

  /** Falls back to the last list read, so an RSK node outage does not hide LPs. */
  private async discover(): Promise<DiscoveredLiquidityProvider[]> {
    if (!this.discovery) {
      throw new ProviderCheckFailure(
        'error',
        'No Flyover discovery address is configured for this network',
      );
    }
    try {
      this.lastDiscovered = await withinTimeLimit(
        this.discovery.getProviders(),
        FLYOVER_DISCOVERY_TIMEOUT_MS,
        'Flyover discovery',
      );
    } catch (err) {
      if (!this.lastDiscovered) {
        throw err;
      }
    }
    return this.lastDiscovered;
  }

  private async checkLiquidityProvider(
    lp: DiscoveredLiquidityProvider,
  ): Promise<CheckOutcome> {
    const startedAt = Date.now();
    let reason: HealthFailureReason | null = null;
    try {
      const body = await this.fetchJson<{status?: unknown}>({
        url: healthUrl(lp.apiBaseUrl),
        operation: 'flyover.lp_health',
        timeoutMs: LIQUIDITY_PROVIDER_CHECK_TIMEOUT_MS,
        maxResponseBytes: MAX_LIQUIDITY_PROVIDER_HEALTH_BYTES,
        // The next round is the retry.
        maxRetries: 0,
      });
      // The LP server answers 200 with `degraded` when a dependency is down.
      if (body?.status !== 'ok') {
        reason = 'error';
      }
    } catch (err) {
      reason = failureReason(err);
    }
    const checkedAt = new Date();
    return {reason, durationMs: checkedAt.getTime() - startedAt, checkedAt};
  }

  private storeLiquidityProviders(
    liquidityProviders: DiscoveredLiquidityProvider[],
    outcomes: CheckOutcome[],
  ): void {
    const previous = new Map(
      this.store.getLiquidityProviders(this.provider).map(lp => [lp.id, lp]),
    );
    const states = liquidityProviders.map((lp, i): LiquidityProviderHealthEntry => {
      const id = Number(lp.id);
      return {id, name: lp.name, ...nextState(previous.get(id), outcomes[i])};
    });
    this.store.setLiquidityProviders(this.provider, states);
  }
}

function healthUrl(apiBaseUrl: string): string {
  if (!apiBaseUrl.toLowerCase().startsWith('https://')) {
    throw new ProviderCheckFailure('error', 'The LP API base URL is not https');
  }
  return `${apiBaseUrl.replace(/\/+$/, '')}/health`;
}
