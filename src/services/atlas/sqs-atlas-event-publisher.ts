import {SQSClient, SendMessageCommand} from '@aws-sdk/client-sqs';
import {AtlasEvent} from '../../models/atlas/atlas-event.model';
import {getLogger, Logger} from '../../utils/logger';
import {AtlasEventPublisher} from './atlas-event-publisher';
import {AtlasEventFlow, AtlasEventMetrics} from './atlas-event-metrics';

const DEFAULT_AWS_REGION = 'us-east-1';

/**
 * How long to wait for the TCP connection to the queue to be established.
 */
const DEFAULT_CONNECTION_TIMEOUT_MS = 2000;
/**
 * How long to wait for a response once the request is on the wire.
 *
 * This is the timeout that matters: the AWS SDK ships `NodeHttpHandler` with
 * `DEFAULT_REQUEST_TIMEOUT = 0`, meaning no timeout at all, so an endpoint that
 * completes the handshake and then never answers leaves this `await` pending
 * forever. `RskChainSyncService` commits the sync pointer before it notifies its
 * subscribers and does not await them, so a publish that never settles does not
 * stall the daemon visibly — it strands every remaining Bridge transaction of
 * that block, unwritten and unlogged, on a block the pointer already calls done.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
/**
 * Attempts per publish, retries included, so the worst case stays bounded at
 * roughly `maxAttempts * requestTimeout` plus the SDK's backoff.
 */
const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * Reads a positive integer from the environment.
 *
 * Anything absent, unparseable or non-positive falls back: a zero or negative
 * timeout is how the SDK spells "wait forever", which is the failure this is
 * here to prevent, so it is not an accepted way to configure it.
 *
 * @param name - The environment variable to read.
 * @param fallback - The value to use when it is absent or invalid.
 * @returns The configured value, or the fallback.
 */
export function positiveIntFromEnv(name: string, fallback: number): number {
  const configured = parseInt(process.env[name] ?? '', 10);
  if (!Number.isFinite(configured) || configured <= 0) {
    return fallback;
  }
  return configured;
}

/**
 * Returns the configured `ATLAS_SQS_QUEUE_URL`, failing fast when it is missing
 * or blank.
 *
 * An empty url does not disable publication, it breaks it: every `SendMessage`
 * would be rejected by the SDK, the failure swallowed by {@link
 * SqsAtlasEventPublisher.publish}, and the events lost with no retry. A daemon
 * started with the kill switch on and no queue to publish to is misconfigured,
 * so it aborts at construction instead of running blind.
 *
 * @returns The configured queue url.
 * @throws Error when `ATLAS_SQS_QUEUE_URL` is absent or blank.
 */
export function assertQueueUrlConfigured(): string {
  const queueUrl = process.env.ATLAS_SQS_QUEUE_URL?.trim();
  if (!queueUrl) {
    throw new Error(
      'Atlas events are enabled but ATLAS_SQS_QUEUE_URL is not set. Set it to ' +
      'the SQS FIFO queue url, or turn ATLAS_EVENTS_ENABLED off.',
    );
  }
  return queueUrl;
}

/**
 * Publishes Atlas SWAP events to an SQS FIFO queue.
 *
 * `MessageGroupId` is the `swap_id`, which keeps the transitions of a single
 * peg-out strictly ordered while letting different peg-outs be processed in
 * parallel. `MessageDeduplicationId` is the `event_id`, so the queue must have
 * content based deduplication disabled.
 *
 * Constructed only while `ATLAS_EVENTS_ENABLED` is on, which is why the missing
 * queue url is fatal here: see {@link assertQueueUrlConfigured}.
 */
export class SqsAtlasEventPublisher implements AtlasEventPublisher {
  readonly metrics: AtlasEventMetrics;
  private logger: Logger;
  private client: SQSClient;
  private queueUrl: string;

  constructor() {
    this.logger = getLogger('sqsAtlasEventPublisher');
    this.metrics = new AtlasEventMetrics();
    this.queueUrl = assertQueueUrlConfigured();
    this.client = new SQSClient({
      region: process.env.AWS_REGION ?? DEFAULT_AWS_REGION,
      maxAttempts: positiveIntFromEnv('ATLAS_SQS_MAX_ATTEMPTS', DEFAULT_MAX_ATTEMPTS),
      // Bounded on purpose: see DEFAULT_REQUEST_TIMEOUT_MS. Publishing must fail
      // in a knowable amount of time, because the daemon is not waiting for it.
      requestHandler: {
        connectionTimeout: positiveIntFromEnv(
          'ATLAS_SQS_CONNECTION_TIMEOUT_MS',
          DEFAULT_CONNECTION_TIMEOUT_MS,
        ),
        requestTimeout: positiveIntFromEnv(
          'ATLAS_SQS_REQUEST_TIMEOUT_MS',
          DEFAULT_REQUEST_TIMEOUT_MS,
        ),
        // Not optional, and not a detail: on its own `requestTimeout` only logs
        // `a request has exceeded the configured N ms requestTimeout` and leaves
        // the request hanging anyway. Without this flag the timeout above is
        // decoration and the publish still never settles.
        throwOnRequestTimeout: true,
      },
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
   * here means one Atlas event that no retry will ever send. A hung queue
   * reaches this catch as a timeout rather than never reaching it at all.
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
