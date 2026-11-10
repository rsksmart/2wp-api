/**
 * One provider's health, as `/health` and `/health/providers` report it.
 *
 * The same shape the swap API reports, so the backoffice reads both APIs the
 * same way.
 */
export class ProviderHealthReport {
  /** The provider's backoffice key, in lower case. */
  provider: string;
  status: 'up' | 'down';
  /** Why the provider is down, as a short code; `null` while it is up. */
  reason: string | null;
  /** How long the last check took, in milliseconds. */
  latencyMs: number;
  /** When the last check ended, as an ISO 8601 timestamp. */
  checkedAt: string;
  /** When the status last changed, as an ISO 8601 timestamp. */
  since: string;
}

/** The body of `GET /health/providers`. */
export class ProviderHealthResponse {
  providers: ProviderHealthReport[];
}
