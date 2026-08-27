import {AtlasEvent} from '../../models/atlas/atlas-event.model';
import {getLogger, Logger} from '../../utils/logger';
import {AtlasEventPublisher} from './atlas-event-publisher';

/**
 * Publisher bound while `ATLAS_EVENTS_ENABLED` is off. It builds no SQS client
 * and performs no IO, so the feature can ship dark in every environment.
 */
export class NoopAtlasEventPublisher implements AtlasEventPublisher {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('noopAtlasEventPublisher');
  }

  /**
   * Discards the event.
   *
   * @param event - The event that would have been published.
   */
  async publish(event: AtlasEvent): Promise<void> {
    this.logger.debug(
      {method: 'publish', eventType: event.event_type, swapId: event.swap_id},
      'Atlas events are disabled, discarding event',
    );
  }
}
