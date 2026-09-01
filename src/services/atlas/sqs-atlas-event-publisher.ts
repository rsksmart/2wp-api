import {SQSClient, SendMessageCommand} from '@aws-sdk/client-sqs';
import {AtlasEvent} from '../../models/atlas/atlas-event.model';
import {getLogger, Logger} from '../../utils/logger';
import {AtlasEventPublisher} from './atlas-event-publisher';
import {AtlasEventFlow, AtlasEventMetrics} from './atlas-event-metrics';

const DEFAULT_AWS_REGION = 'us-east-1';

/**
 * Publishes Atlas SWAP events to an SQS FIFO queue.
 *
 * `MessageGroupId` is the `swap_id`, which keeps the transitions of a single
 * peg-out strictly ordered while letting different peg-outs be processed in
 * parallel. `MessageDeduplicationId` is the `event_id`, so the queue must have
 * content based deduplication disabled.
 */
export class SqsAtlasEventPublisher implements AtlasEventPublisher {
  readonly metrics: AtlasEventMetrics;
  private logger: Logger;
  private client: SQSClient;
  private queueUrl: string;

  constructor() {
    this.logger = getLogger('sqsAtlasEventPublisher');
    this.metrics = new AtlasEventMetrics();
    this.queueUrl = process.env.ATLAS_SQS_QUEUE_URL ?? '';
    this.client = new SQSClient({
      region: process.env.AWS_REGION ?? DEFAULT_AWS_REGION,
      // Only set for local development and the integration suite (LocalStack).
      ...(process.env.ATLAS_SQS_ENDPOINT ? {endpoint: process.env.ATLAS_SQS_ENDPOINT} : {}),
    });
  }

  /**
   * Sends the event to the configured FIFO queue. Delivery failures are logged
   * at error level and never propagated: the peg-out status is already stored
   * and the daemon must keep processing blocks.
   *
   * Either outcome is counted, which is what makes a loss visible: a failure
   * here means one Atlas event that no retry will ever send.
   *
   * @param event - The event to publish.
   * @param flow - Which peg the event belongs to.
   */
  async publish(event: AtlasEvent, flow?: AtlasEventFlow): Promise<void> {
    try {
      await this.client.send(new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(event),
        MessageGroupId: event.swap_id,
        MessageDeduplicationId: event.event_id,
      }));
      this.logger.debug(
        {method: 'publish', eventType: event.event_type, swapId: event.swap_id},
        'Atlas event published',
      );
      this.metrics.recordSuccess(event.event_type, flow);
    } catch (e) {
      this.logger.error(
        {
          method: 'publish',
          err: e,
          eventType: event.event_type,
          swapId: event.swap_id,
          eventId: event.event_id,
        },
        'Could not publish the Atlas event',
      );
      this.metrics.recordFailure(event.event_type, flow);
    }
  }

  /**
   * Releases the underlying SQS client sockets. Used by the integration suite.
   */
  destroy(): void {
    this.client.destroy();
  }
}
