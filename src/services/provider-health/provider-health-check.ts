/**
 * Why a provider check failed, as a short code.
 *
 * `/health` is public, so it reports these codes rather than raw error text,
 * which can name internal hosts and addresses.
 *
 * - `timeout`: the provider did not answer in time.
 * - `refused`: the provider's host refused the connection.
 * - `http_5xx`: the provider answered with a server error.
 * - `error`: any other failure.
 * - `no_capacity`: the provider answered, but cannot take a new operation.
 */
export const HEALTH_FAILURE_REASONS = [
  'timeout',
  'refused',
  'http_5xx',
  'error',
  'no_capacity',
] as const;

export type HealthFailureReason = (typeof HEALTH_FAILURE_REASONS)[number];

/**
 * A provider check failure whose reason is already known.
 *
 * Thrown by a check that reached the provider and found it unusable (for
 * example `no_capacity`), and by the health job when a check runs past its
 * time limit (`timeout`). A failure of the call itself, such as a refused
 * connection, is thrown as the original error instead and classified where the
 * result is recorded.
 */
export class ProviderCheckFailure extends Error {
  readonly reason: HealthFailureReason;

  constructor(reason: HealthFailureReason, message: string) {
    super(message);
    this.name = 'ProviderCheckFailure';
    this.reason = reason;
  }
}

/** One check per provider, run by the background health job. */
export interface ProviderHealthCheck {
  /** The provider's backoffice key, in lower case. */
  readonly provider: string;

  /**
   * Checks the provider once.
   *
   * @returns Resolves when the provider is usable; rejects when it is not.
   */
  check(): Promise<void>;
}
