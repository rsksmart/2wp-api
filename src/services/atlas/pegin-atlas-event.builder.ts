import {randomUUID} from 'crypto';
import {
  ASSET_BTC,
  ASSET_RBTC,
  ATLAS_PROVIDER,
  ATLAS_SCHEMA_VERSION,
  ATLAS_SOURCE,
  ATLAS_SWAP_TYPE,
  AtlasEvent,
  AtlasEventData,
  AtlasEventType,
  SwapCompletedData,
  SwapCreatedData,
  SwapRejectedData,
} from '../../models/atlas/atlas-event.model';
import {resolvePeginChainIds} from '../../models/atlas/atlas-chain';
import {satoshisToDecimalString} from '../../models/atlas/atlas-amount';
import {normalizeAddress, normalizeSwapId} from '../../models/atlas/atlas-identifiers';
import {
  errorCategoryOf,
  nonRefundablePeginReasonName,
  rejectedPeginReasonName,
} from '../../models/atlas/atlas-pegin-reasons';
import {
  PeginStatus,
  PeginStatusDataModel,
} from '../../models/rsk/pegin-status-data.model';
import {BRIDGE_EVENTS} from '../../utils/bridge-utils';
import {ExtendedBridgeEvent} from '../../models/types/bridge-transaction-parser';
import ExtendedBridgeTx from '../extended-bridge-tx';

const REJECTED_MESSAGE_PREFIX = 'Peg-in rejected by the Bridge';
const ABSENT_REASON = 'absent';
/**
 * Reported when the Bridge rejected the peg-in and emitted no refund branch.
 * The name describes what was observed, not the cause: the probable one —
 * `buildEmptyWalletTo` failing and rskj panicking — is nowhere in the logs.
 */
const NO_REFUND_BRANCH_CODE = 'PEGIN_REJECTED_NO_REFUND_BRANCH';
const NO_REFUND_BRANCH_CLAUSE = 'the Bridge emitted no refund branch';
/** The Bridge credits the whole amount sent: a peg-in has no fee to subtract. */
const NO_FEE = satoshisToDecimalString(0);
const ZERO_AMOUNT = satoshisToDecimalString(0);

/**
 * Data that only exists in the Bridge logs of the transaction being processed.
 *
 * `PeginStatusDataModel` persists neither the amount nor the addresses, so the
 * builder receives them alongside the status instead of the daemon growing new
 * columns for them.
 */
export interface PeginAtlasEventContext {
  /**
   * `amount` **in satoshis**, from `pegin_btc` / `lock_btc` when the peg-in was
   * locked, or from `release_requested` when it was rejected with a refund.
   * Absent only for an unrefundable rejection, whose logs carry no amount.
   *
   * Unlike the peg-out logs, whose `amount` is in weis, all three peg-in logs
   * report satoshis directly, so no conversion applies here.
   */
  amountInSatoshis?: string;
  /** Only `lock_btc` carries the Bitcoin address of the sender. */
  senderBtcAddress?: string;
  /** `receiver` of `pegin_btc` / `lock_btc`: the destination account on Rootstock. */
  rskRecipient?: string;
  /** `reason` of `rejected_pegin`. */
  rejectedReason?: string;
  /** `reason` of `unrefundable_pegin`. */
  unrefundableReason?: string;
}

/**
 * Turns a persisted peg-in status into the Atlas SWAP events its transition
 * represents.
 *
 * Unlike peg-out, a peg-in record is written once and never updated, so every
 * event of one peg-in is emitted in a single pass over one Bridge transaction:
 * `LOCKED` produces `swap.created` and `swap.completed` together, and a
 * rejection produces `swap.created` and `swap.rejected`. `swap.pending` has no
 * trigger, since the daemon never observes the deposit on Bitcoin.
 */
export class PeginAtlasEventBuilder {

  /**
   * Reads from the Bridge logs the fields the persisted status does not keep.
   *
   * @param extendedBridgeTx - The Bridge transaction being processed.
   * @returns The context for {@link PeginAtlasEventBuilder.build}.
   */
  public static extractContext(extendedBridgeTx: ExtendedBridgeTx): PeginAtlasEventContext {
    const events = (extendedBridgeTx?.events ?? []) as ExtendedBridgeEvent[];
    const byName = (name: string) => events.find(event => event.name === name);

    const lockBtc = byName(BRIDGE_EVENTS.LOCK_BTC);
    const peginBtc = byName(BRIDGE_EVENTS.PEGIN_BTC);
    const rejected = byName(BRIDGE_EVENTS.REJECTED_PEGIN);
    const unrefundable = byName(BRIDGE_EVENTS.UNREFUNDABLE_PEGIN);
    const releaseRequested = byName(BRIDGE_EVENTS.RELEASE_REQUESTED);
    const locked = lockBtc ?? peginBtc;

    const context: PeginAtlasEventContext = {};
    if (locked) {
      context.amountInSatoshis = this.asString(locked.arguments.amount);
      context.rskRecipient = this.asString(locked.arguments.receiver);
    } else if (releaseRequested) {
      // A refundable rejection reports the amount nowhere else. This is
      // `computeTotalAmountSent(btcTx)` on the Bridge side: the total the user
      // sent to the federation, in satoshis, which is the right input_amount.
      // The refund arrives minus the Bitcoin fee, but that difference belongs
      // to an outgoing event this schema does not have.
      //
      // A locked log and a release_requested do not coexist in one peg-in
      // transaction; fixing the precedence anyway leaves the behaviour defined
      // if they ever do.
      context.amountInSatoshis = this.asString(releaseRequested.arguments.amount);
    }
    if (lockBtc) {
      context.senderBtcAddress = this.asString(lockBtc.arguments.senderBtcAddress);
    }
    if (rejected) {
      context.rejectedReason = this.asString(rejected.arguments.reason);
    }
    if (unrefundable) {
      context.unrefundableReason = this.asString(unrefundable.arguments.reason);
    }
    return context;
  }

  /**
   * Builds the Atlas events matching the status of `pegin`.
   *
   * Every in-scope status yields two events, `swap.created` first so the Worker
   * has a row carrying chains and assets, then the outcome — `swap.completed`
   * or `swap.rejected`. The order of the array is the order they must be
   * published in.
   *
   * @param pegin - The peg-in status just written to the database.
   * @param context - Fields read from the Bridge logs of the same transaction.
   * @returns The events to publish, empty when the status is out of scope.
   */
  public static build(
    pegin: PeginStatusDataModel,
    context: PeginAtlasEventContext = {},
  ): AtlasEvent[] {
    switch (pegin.status) {
      case PeginStatus.LOCKED:
        return [
          this.envelope(pegin, AtlasEventType.SWAP_CREATED, this.createdData(context)),
          this.envelope(
            pegin,
            AtlasEventType.SWAP_COMPLETED,
            this.completedData(pegin, context),
          ),
        ];
      case PeginStatus.REJECTED_REFUND:
        return [
          this.envelope(pegin, AtlasEventType.SWAP_CREATED, this.createdData(context)),
          this.envelope(pegin, AtlasEventType.SWAP_REJECTED, this.refundableRejection(context)),
        ];
      case PeginStatus.REJECTED_NO_REFUND:
        return [
          this.envelope(pegin, AtlasEventType.SWAP_CREATED, this.createdData(context)),
          this.envelope(pegin, AtlasEventType.SWAP_REJECTED, this.unrefundableRejection(context)),
        ];
      default:
        return [];
    }
  }

  private static envelope(
    pegin: PeginStatusDataModel,
    eventType: AtlasEventType,
    data: AtlasEventData,
  ): AtlasEvent {
    return {
      event_id: randomUUID(),
      event_type: eventType,
      swap_id: normalizeSwapId(pegin.btcTxId),
      swap_type: ATLAS_SWAP_TYPE,
      source: ATLAS_SOURCE,
      schema_version: ATLAS_SCHEMA_VERSION,
      emitted_at: new Date(pegin.createdOn).toISOString(),
      data,
    };
  }

  private static createdData(context: PeginAtlasEventContext): SwapCreatedData {
    const {sourceChain, destinationChain} = resolvePeginChainIds();
    return {
      provider: ATLAS_PROVIDER,
      source_chain: sourceChain,
      destination_chain: destinationChain,
      input_asset: ASSET_BTC,
      output_asset: ASSET_RBTC,
      input_amount: this.inputAmount(context),
      input_amount_usd: null,
      // `lock_btc` is the only log carrying the user's Bitcoin address; with
      // `pegin_btc` the best available is the Rootstock destination account,
      // and a rejection carries neither.
      wallet_address: normalizeAddress(context.senderBtcAddress ?? context.rskRecipient),
      wallet_type: null,
      quote_id: null,
    };
  }

  /**
   * Describes the completion of a peg-in.
   *
   * `duration_ms` travels null on purpose: the daemon observes Rootstock only,
   * so when the deposit was broadcast on Bitcoin is unknown, and a zero would
   * pull the average swap duration down instead of leaving it unmeasured.
   *
   * @param pegin - The peg-in status just persisted.
   * @param context - Fields read from the Bridge logs.
   * @returns The `swap.completed` payload.
   */
  private static completedData(
    pegin: PeginStatusDataModel,
    context: PeginAtlasEventContext,
  ): SwapCompletedData {
    return {
      // The RBTC is credited by the very Rootstock transaction being processed.
      destination_tx_hash: normalizeSwapId(pegin.rskTxId),
      output_amount: this.inputAmount(context),
      output_amount_usd: null,
      fee: NO_FEE,
      duration_ms: null,
    };
  }

  private static refundableRejection(context: PeginAtlasEventContext): SwapRejectedData {
    const reasonName = rejectedPeginReasonName(context.rejectedReason);
    return {
      error_category: errorCategoryOf(reasonName),
      error_code: reasonName,
      error_message: this.rejectionMessage(reasonName, context),
      refund_applicable: true,
    };
  }

  /**
   * Describes a rejection whose funds are not coming back, in both of its
   * shapes: the Bridge declared the peg-in unrefundable, or it emitted no
   * refund branch at all.
   *
   * The `error_category` always comes from the `rejected_pegin` reason, which
   * is the root cause and the only log present in every branch. The
   * `error_code` names that same reason, except when there is no refund branch
   * to speak of: that absence is the more specific fact, so it takes the code.
   *
   * @param context - Fields read from the Bridge logs.
   * @returns The `swap.rejected` payload.
   */
  private static unrefundableRejection(context: PeginAtlasEventContext): SwapRejectedData {
    const reasonName = rejectedPeginReasonName(context.rejectedReason);
    const declared = nonRefundablePeginReasonName(context.unrefundableReason) !== undefined;
    return {
      error_category: errorCategoryOf(reasonName),
      error_code: declared ? reasonName : NO_REFUND_BRANCH_CODE,
      error_message: this.rejectionMessage(
        reasonName,
        context,
        declared ? undefined : NO_REFUND_BRANCH_CLAUSE,
      ),
      refund_applicable: false,
    };
  }

  /**
   * Composes the human-readable rejection message.
   *
   * The raw numbers travel here, in the message, so a reason this build cannot
   * name is still recoverable from the event itself without going back to the
   * chain.
   *
   * @param reasonName - The named reason of `rejected_pegin`.
   * @param context - Fields read from the Bridge logs.
   * @param clause - What to say instead when there is no `unrefundable_pegin`
   * reason to report.
   * @returns The message for `swap.rejected`.
   */
  private static rejectionMessage(
    reasonName: string,
    context: PeginAtlasEventContext,
    clause?: string,
  ): string {
    const unrefundableName = nonRefundablePeginReasonName(context.unrefundableReason);
    const reasons = [`rejected_pegin reason=${context.rejectedReason ?? ABSENT_REASON}`];
    let message = `${REJECTED_MESSAGE_PREFIX}: ${reasonName}`;
    if (unrefundableName !== undefined) {
      message += ` \u2014 funds not refundable (${unrefundableName})`;
      reasons.push(`unrefundable_pegin reason=${context.unrefundableReason}`);
    } else if (clause !== undefined) {
      message += ` \u2014 ${clause}`;
    }
    return `${message}. ${reasons.join(', ')}`;
  }

  private static inputAmount(context: PeginAtlasEventContext): string {
    if (context.amountInSatoshis === undefined) {
      // Only an unrefundable rejection gets here: neither `rejected_pegin` nor
      // `unrefundable_pegin` carries an amount and there is no other
      // transaction to read it from, so zero is the only honest value.
      return ZERO_AMOUNT;
    }
    // `pegin_btc` / `lock_btc` report satoshis. Running these through the
    // peg-out helper `fromWeiNumberToSatoshiNumber` divides by 1e10 and
    // collapses every realistic peg-in to zero.
    return satoshisToDecimalString(Number(context.amountInSatoshis));
  }

  private static asString(value: unknown): string | undefined {
    return value === undefined || value === null ? undefined : String(value);
  }

}
