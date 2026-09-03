import {getLogger, Logger} from '../../utils/logger';

/**
 * Name of the metric field, and the contract with the log aggregator: this is
 * what an alert on lost Atlas events queries. Renaming it for style would
 * silently break that alert, so it is pinned by a test and documented in
 * `ENV_VARIABLES.md`.
 */
export const ATLAS_EVENTS_PUBLISHED_METRIC = 'atlas_events_published_total';

/** Which peg the event belongs to. The envelope does not carry it. */
export type AtlasEventFlow = 'pegin' | 'pegout';

export type AtlasPublicationStatus = 'success' | 'failure';

/** Used as a key component when the caller did not say which flow it is. */
const UNSPECIFIED_FLOW = 'unspecified';

/**
 * Counts Atlas event publications and logs one line per publication.
 *
 * This makes the loss described in `ENV_VARIABLES.md` visible: a publisher that
 * swallows a transport failure to keep the daemon running leaves no trace of
 * how much analytics data went missing. It does **not** recover the events —
 * that needs an outbox, or at least an `atlasPublishedAt` flag on the status.
 *
 * The counter lives in memory and resets with the process, which is enough for
 * an aggregator that reads the logged totals.
 */
export class AtlasEventMetrics {
  private logger: Logger;
  private counters: Map<string, number> = new Map();

  constructor(logger: Logger = getLogger('atlasEventMetrics')) {
    this.logger = logger;
  }

  /**
   * Records an event that reached the queue.
   *
   * @param eventType - `event_type` of the published event.
   * @param flow - Which peg it belongs to.
   */
  recordSuccess(eventType: string, flow?: AtlasEventFlow): void {
    this.record('success', eventType, flow);
  }

  /**
   * Records an event that did not reach the queue and is now lost.
   *
   * @param eventType - `event_type` of the event that failed to publish.
   * @param flow - Which peg it belongs to.
   */
  recordFailure(eventType: string, flow?: AtlasEventFlow): void {
    this.record('failure', eventType, flow);
  }

  /**
   * Reads a running total.
   *
   * @param status - Whether to count successes or failures.
   * @param eventType - `event_type` to count.
   * @param flow - Which peg to count, matching how it was recorded.
   * @returns The count since this process started, `0` if never recorded.
   */
  total(status: AtlasPublicationStatus, eventType: string, flow?: AtlasEventFlow): number {
    return this.counters.get(counterKey(status, eventType, flow)) ?? 0;
  }

  /**
   * Increments the counter and logs the metric line.
   *
   * The counter is advanced before logging, and logging is guarded: a broken
   * log pipeline must not throw into a publisher whose whole contract is not to
   * throw, and must not lose the count either.
   *
   * @param status - Whether the publication succeeded.
   * @param eventType - `event_type` of the event.
   * @param flow - Which peg it belongs to.
   */
  private record(
    status: AtlasPublicationStatus,
    eventType: string,
    flow?: AtlasEventFlow,
  ): void {
    const key = counterKey(status, eventType, flow);
    const total = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, total);

    const line = {
      metric: ATLAS_EVENTS_PUBLISHED_METRIC,
      status,
      flow: flow ?? UNSPECIFIED_FLOW,
      eventType,
      total,
    };
    try {
      if (status === 'failure') {
        this.logger.warn(line, 'Atlas event publication failed');
      } else {
        this.logger.info(line, 'Atlas event published');
      }
    } catch (e) {
      // Nothing to do: the count is already recorded and this is a metric.
    }
  }
}

/**
 * Builds the counter key. One counter per status, flow and event type, so a
 * failure of one event type cannot hide behind the successes of another.
 *
 * @param status - Whether the publication succeeded.
 * @param eventType - `event_type` of the event.
 * @param flow - Which peg it belongs to.
 * @returns The map key.
 */
function counterKey(
  status: AtlasPublicationStatus,
  eventType: string,
  flow?: AtlasEventFlow,
): string {
  return `${status}|${flow ?? UNSPECIFIED_FLOW}|${eventType}`;
}
