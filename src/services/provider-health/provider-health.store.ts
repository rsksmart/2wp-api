import {ProviderHealthState} from './status-rules';

export interface LiquidityProviderHealthEntry extends ProviderHealthState {
  id: number;
  name: string;
}

/** A provider's stored health, with the provider it belongs to. */
export interface ProviderHealthEntry extends ProviderHealthState {
  /** The provider's backoffice key, in lower case. */
  provider: string;
  liquidityProviders?: LiquidityProviderHealthEntry[];
}

/**
 * The last known health of every provider, kept in memory.
 *
 * The background job writes it and `/health` reads it, so no request ever
 * contacts a provider. Each API instance keeps its own copy, so two instances
 * can disagree for up to one check interval.
 *
 * Keys are compared in lower case, the form the backoffice uses.
 */
export class ProviderHealthStore {
  private readonly states = new Map<string, ProviderHealthState>();
  private readonly liquidityProviders = new Map<string, LiquidityProviderHealthEntry[]>();

  /**
   * @param provider - The provider's key.
   * @returns Its last stored health, or `undefined` before its first check ends.
   */
  get(provider: string): ProviderHealthState | undefined {
    const state = this.states.get(provider.toLowerCase());
    return state && {...state};
  }

  /**
   * Replaces a provider's stored health.
   *
   * @param provider - The provider's key.
   * @param state - Its state after the latest check.
   */
  set(provider: string, state: ProviderHealthState): void {
    this.states.set(provider.toLowerCase(), {...state});
  }

  getLiquidityProviders(provider: string): LiquidityProviderHealthEntry[] {
    return (this.liquidityProviders.get(provider.toLowerCase()) ?? []).map(lp => ({...lp}));
  }

  setLiquidityProviders(
    provider: string,
    liquidityProviders: LiquidityProviderHealthEntry[],
  ): void {
    this.liquidityProviders.set(
      provider.toLowerCase(),
      liquidityProviders.map(lp => ({...lp})),
    );
  }

  /**
   * @returns Every provider with a stored health, sorted by key. Empty until
   * the first check ends.
   */
  list(): ProviderHealthEntry[] {
    return [...this.states.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, state]) => {
        const entry: ProviderHealthEntry = {provider, ...state};
        if (this.liquidityProviders.has(provider)) {
          entry.liquidityProviders = this.getLiquidityProviders(provider);
        }
        return entry;
      });
  }
}
