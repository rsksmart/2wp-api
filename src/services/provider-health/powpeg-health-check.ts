import {BridgeService} from '../bridge.service';
import {ProviderCheckFailure, ProviderHealthCheck} from './provider-health-check';

/**
 * Checks whether a user can start a native peg-in right now.
 *
 * Two things must hold. The bridge must answer, which the federation address
 * call proves. And the bridge must still accept at least one minimum peg-in
 * before it reaches its locking cap: a peg-in over the cap is rejected and its
 * BTC is sent back. This is a capacity check, not a liquidity check.
 */
export class PowpegHealthCheck implements ProviderHealthCheck {
  readonly provider = 'powpeg';

  constructor(private readonly bridgeService: BridgeService) {}

  /**
   * Calls the bridge for the federation address, the remaining peg-in capacity
   * and the minimum peg-in, all at once.
   *
   * @returns Resolves when the bridge answers and has room for a minimum
   * peg-in. Rejects with the bridge call's own error when a call fails, and
   * with a {@link ProviderCheckFailure} when the bridge answers but the route
   * cannot be used.
   */
  async check(): Promise<void> {
    const [federationAddress, remainingCapacity, minimumPegin] =
      await Promise.all([
        this.bridgeService.getFederationAddress(),
        this.bridgeService.getRemainingPeginCapacity(),
        this.bridgeService.getMinPeginValue(),
      ]);

    if (!federationAddress) {
      throw new ProviderCheckFailure(
        'error',
        'The bridge returned no federation address',
      );
    }
    if (remainingCapacity < minimumPegin) {
      throw new ProviderCheckFailure(
        'no_capacity',
        `The bridge accepts ${remainingCapacity} more satoshis, below the ` +
          `${minimumPegin}-satoshi minimum peg-in`,
      );
    }
  }
}
