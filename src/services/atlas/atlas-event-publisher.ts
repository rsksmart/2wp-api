import {AtlasEvent} from '../../models/atlas/atlas-event.model';
import {AtlasEventFlow, AtlasEventMetrics} from './atlas-event-metrics';

/**
 * Publishes Atlas SWAP events. Consumers depend on this interface and never on
 * a concrete transport, so the SQS client can be stubbed in tests and replaced
 * later (e.g. by an outbox-backed publisher) without touching the callers.
 */
export interface AtlasEventPublisher {
  /**
   * Publishes one event. Implementations must never reject: a transport failure
   * is logged and swallowed so a peg transition already persisted is not rolled
   * back because analytics were unreachable.
   *
   * @param event - The event to publish.
   * @param flow - Which peg the event belongs to. Optional so existing callers
   * and implementations keep working; it cannot be derived from the envelope,
   * which is why it is passed in.
   */
  publish(event: AtlasEvent, flow?: AtlasEventFlow): Promise<void>;

  /**
   * Counters of what this publisher published, and of what it lost. Exposed so
   * a caller — or a test — can read the totals the logs report.
   */
  readonly metrics: AtlasEventMetrics;
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
