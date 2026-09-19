import {createHash} from 'crypto';
import {AtlasEventType} from './atlas-event.model';

/**
 * The namespace every Atlas event id is derived under.
 *
 * A UUIDv5 hashes a namespace together with a name; the namespace is what keeps
 * these ids from colliding with a v5 someone else derives from the same name in
 * a different context. This one is itself the v5 of
 * `rootstock.io/atlas-swap-events` under the standard DNS namespace
 * (`6ba7b810-9dad-11d1-80b4-00c04fd430c8`), so it is reproducible rather than a
 * number pulled out of the air.
 *
 * It must never change. A different namespace re-ids every event, so the deploy
 * that changed it would republish everything still inside the deduplication
 * window as new.
 */
const ATLAS_EVENT_NAMESPACE = '0c29a3c4-87b7-568f-83f9-22cb695ee4a2';

const NAMESPACE_BYTES = Buffer.from(ATLAS_EVENT_NAMESPACE.replace(/-/g, ''), 'hex');

/** What separates the parts of the name, chosen because no hash contains it. */
const PART_SEPARATOR = '|';

/**
 * Formats the first 16 bytes of a digest as an RFC 4122 version 5 UUID.
 *
 * The version and variant bits are stamped in because the schema types
 * `event_id` as a UUID and consumers are entitled to read one: a bare hash
 * sliced into the 8-4-4-4-12 shape would match the pattern while claiming a
 * version it does not have.
 *
 * @param digest - A SHA-1 digest of the namespace and the name.
 * @returns The canonical UUID string.
 */
function formatAsUuidV5(digest: Buffer): string {
  const bytes = Buffer.from(digest.subarray(0, 16));
  // eslint-disable-next-line no-bitwise
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  // eslint-disable-next-line no-bitwise
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Lowercases a hash so the same transaction spelled two ways derives one id,
 * for the same reason {@link normalizeSwapId} exists.
 *
 * @param value - The hash as it came from the database or the Bridge log.
 * @returns The hash in one spelling, or an empty segment when there is none.
 */
function normalizePart(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Derives the `event_id` of an Atlas event from what the event *is*.
 *
 * The publisher sends this as the SQS `MessageDeduplicationId` on a queue with
 * content based deduplication disabled, which only means something if the id is
 * a function of the event's identity: a random uuid makes every message unique
 * by construction and the deduplication a no-op. Deriving it here makes a
 * reprocessed block — a restart, a re-scan — resend the same id for the same
 * transition, so the queue drops it.
 *
 * The window that deduplication covers is only five minutes, so this is not by
 * itself idempotency; what it is, is the precondition for it. An `event_id` that
 * means the same thing on every emission is what lets Atlas deduplicate on the
 * consumer side, where there is no window.
 *
 * The three parts identify a transition exactly. `swapId` names the swap,
 * `eventType` the transition within it, and `rskTxHash` the Rootstock
 * transaction that caused it — the last one because a peg-in emits two events
 * from one transaction and a batched peg-out carries an index appended to the
 * hash, and because including it errs toward publishing a duplicate rather than
 * silently dropping a distinct event.
 *
 * @param swapId - The normalized `swap_id` of the event.
 * @param eventType - The transition being reported.
 * @param rskTxHash - The Rootstock transaction the transition was read from.
 * @returns The deterministic `event_id`.
 */
export function atlasEventId(
  swapId: string,
  eventType: AtlasEventType,
  rskTxHash: string | undefined | null,
): string {
  const name = [normalizePart(swapId), eventType, normalizePart(rskTxHash)]
    .join(PART_SEPARATOR);
  const digest = createHash('sha1')
    .update(NAMESPACE_BYTES)
    .update(name, 'utf8')
    .digest();
  return formatAsUuidV5(digest);
}
