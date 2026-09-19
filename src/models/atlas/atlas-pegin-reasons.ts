import {getLogger, Logger} from '../../utils/logger';

const logger: Logger = getLogger('atlasPeginReasons');

/**
 * `reason` of `rejected_pegin`, mirroring rskj's `RejectedPeginReason`.
 *
 * Verified against rsksmart/rskj@161c3f1. This table is the only artifact that
 * has to stay aligned with rskj: if a value is added there, it lands here as
 * {@link UNKNOWN_REASON_NAME} with a warning rather than silently changing
 * meaning. See `RejectedPeginReason.java`.
 */
export const REJECTED_PEGIN_REASONS = {
  // Unreachable after arrowhead600; if it shows up, something is wrong.
  '1': 'PEGIN_CAP_SURPASSED',
  '2': 'LEGACY_PEGIN_MULTISIG_SENDER',
  '3': 'LEGACY_PEGIN_UNDETERMINED_SENDER',
  // Unreadable OP_RETURN payload.
  '4': 'PEGIN_V1_INVALID_PAYLOAD',
  '5': 'INVALID_AMOUNT',
} as const;

/**
 * `reason` of `unrefundable_pegin`, mirroring rskj's `NonRefundablePeginReason`.
 *
 * A different enum from {@link REJECTED_PEGIN_REASONS} that happens to share
 * the same position in the log: reason `3` means `LEGACY_PEGIN_UNDETERMINED_SENDER`
 * in one and `INVALID_AMOUNT` in the other. Translating by number alone, without
 * branching on the event name first, is exactly the bug this table prevents.
 */
export const NON_REFUNDABLE_PEGIN_REASONS = {
  '1': 'LEGACY_PEGIN_UNDETERMINED_SENDER',
  '2': 'PEGIN_V1_REFUND_ADDRESS_NOT_SET',
  '3': 'INVALID_AMOUNT',
  '4': 'OUTPUTS_SENT_TO_DIFFERENT_TYPES_OF_FEDS',
} as const;

/** Reported when the Bridge sent a reason this table does not know. */
export const UNKNOWN_REASON_NAME = 'UNKNOWN';

export type AtlasErrorCategory = 'validation' | 'protocol_violation';

const VALIDATION: AtlasErrorCategory = 'validation';
const PROTOCOL_VIOLATION: AtlasErrorCategory = 'protocol_violation';

/**
 * The only two reasons that describe a sender not honoring the protocol. Every
 * other reason — an amount, a cap, an unreadable payload — is the Bridge
 * validating the request, which is what `validation` means.
 */
const PROTOCOL_VIOLATIONS: ReadonlySet<string> = new Set([
  'LEGACY_PEGIN_MULTISIG_SENDER',
  'LEGACY_PEGIN_UNDETERMINED_SENDER',
]);

/**
 * Names the `reason` of a `rejected_pegin` log.
 *
 * @param reason - The numeric reason as it came in the log.
 * @returns The rskj enum name, or {@link UNKNOWN_REASON_NAME} when this table
 * does not have that value.
 */
export function rejectedPeginReasonName(reason: string | undefined | null): string {
  return nameOf(REJECTED_PEGIN_REASONS, reason, 'rejected_pegin');
}

/**
 * Names the `reason` of an `unrefundable_pegin` log.
 *
 * @param reason - The numeric reason as it came in the log.
 * @returns The rskj enum name, {@link UNKNOWN_REASON_NAME} when the value is
 * unknown, or `undefined` when there was no `unrefundable_pegin` log at all —
 * two cases the caller must tell apart.
 */
export function nonRefundablePeginReasonName(
  reason: string | undefined | null,
): string | undefined {
  if (reason === undefined || reason === null || `${reason}` === '') {
    return undefined;
  }
  return nameOf(NON_REFUNDABLE_PEGIN_REASONS, reason, 'unrefundable_pegin');
}

/**
 * Classifies a named reason for the `error_category` of `swap.rejected`.
 *
 * @param reasonName - A name returned by one of the translation functions.
 * @returns `protocol_violation` only for the sender-side reasons; `validation`
 * for everything else, the unknown fallback included.
 */
export function errorCategoryOf(reasonName: string): AtlasErrorCategory {
  return PROTOCOL_VIOLATIONS.has(reasonName) ? PROTOCOL_VIOLATION : VALIDATION;
}

/**
 * Looks a reason up in one table, warning when it is not there.
 *
 * The warning is the whole degradation strategy: emission never breaks, but a
 * value rskj added after this table was written leaves a trace someone can act
 * on.
 *
 * @param table - The translation table of the log being read.
 * @param reason - The numeric reason as it came in the log.
 * @param eventName - Name of the log, for the warning.
 * @returns The name, or {@link UNKNOWN_REASON_NAME}.
 */
function nameOf(
  table: Record<string, string>,
  reason: string | undefined | null,
  eventName: string,
): string {
  const key = reason === undefined || reason === null ? '' : `${reason}`;
  const name = table[key];
  if (!name) {
    logger.warn(
      {method: 'nameOf', event: eventName, reason: key},
      'Unknown Bridge rejection reason, reporting it as UNKNOWN',
    );
    return UNKNOWN_REASON_NAME;
  }
  return name;
}
