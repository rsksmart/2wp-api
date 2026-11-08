import {ProviderHealthState} from './status-rules';

/** A provider's stored health, with the provider it belongs to. */
export interface ProviderHealthEntry extends ProviderHealthState {
  /** The provider's backoffice key, in lower case. */
  provider: string;
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

  /**
   * @returns Every provider with a stored health, sorted by key. Empty until
   * the first check ends.
   */
  list(): ProviderHealthEntry[] {
    return [...this.states.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, state]) => ({provider, ...state}));
  }
}
