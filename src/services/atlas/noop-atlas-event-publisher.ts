import {AtlasEvent} from '../../models/atlas/atlas-event.model';
import {getLogger, Logger} from '../../utils/logger';
import {AtlasEventPublisher} from './atlas-event-publisher';
import {AtlasEventFlow, AtlasEventMetrics} from './atlas-event-metrics';

/**
 * Publisher bound while `ATLAS_EVENTS_ENABLED` is off. It builds no SQS client
 * and performs no IO, so the feature can ship dark in every environment.
 */
export class NoopAtlasEventPublisher implements AtlasEventPublisher {
  /**
   * Always empty. A metric named `published_total` must not count events that
   * were never published, so discarding leaves the counters at zero.
   */
  readonly metrics: AtlasEventMetrics;
  private logger: Logger;

  constructor() {
    this.logger = getLogger('noopAtlasEventPublisher');
    this.metrics = new AtlasEventMetrics(this.logger);
  }

  /**
   * Discards the event.
   *
   * Never rejects, as {@link AtlasEventPublisher.publish} requires: with the
   * feature off the only thing that can fail here is the logger, and a broken
   * log pipeline must not take peg processing down with it.
   *
   * @param event - The event that would have been published.
   * @param flow - Which peg it would have belonged to. Unused.
   */
  async publish(event: AtlasEvent, flow?: AtlasEventFlow): Promise<void> {
    try {
      this.logger.debug(
        {method: 'publish', eventType: event.event_type, swapId: event.swap_id},
        'Atlas events are disabled, discarding event',
      );
    } catch {
      // Nothing to report it with, and nothing was at stake: the event was
      // going to be discarded either way.
    }
  }
}
