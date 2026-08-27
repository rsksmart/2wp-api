import {AtlasEvent} from '../../models/atlas/atlas-event.model';

/**
 * Publishes Atlas SWAP events. Consumers depend on this interface and never on
 * a concrete transport, so the SQS client can be stubbed in tests and replaced
 * later (e.g. by an outbox-backed publisher) without touching the callers.
 */
export interface AtlasEventPublisher {
  /**
   * Publishes one event. Implementations must never reject: a transport failure
   * is logged and swallowed so a peg-out transition already persisted is not
   * rolled back because analytics were unreachable.
   *
   * @param event - The event to publish.
   */
  publish(event: AtlasEvent): Promise<void>;
}

/**
 * Reads the `ATLAS_EVENTS_ENABLED` kill switch. Anything other than the literal
 * `true` keeps publication off, so a typo fails closed.
 *
 * @returns `true` only when Atlas event publication is explicitly enabled.
 */
export function isAtlasEventsEnabled(): boolean {
  return process.env.ATLAS_EVENTS_ENABLED === 'true';
}
