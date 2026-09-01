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
  SwapCreatedData,
  SwapRejectedData,
} from '../../models/atlas/atlas-event.model';
import {resolvePeginChainIds} from '../../models/atlas/atlas-chain';
import {satoshisToDecimalString} from '../../models/atlas/atlas-amount';
import {
  PeginStatus,
  PeginStatusDataModel,
} from '../../models/rsk/pegin-status-data.model';
import {BRIDGE_EVENTS} from '../../utils/bridge-utils';
import {ExtendedBridgeEvent} from '../../models/types/bridge-transaction-parser';
import ExtendedBridgeTx from '../extended-bridge-tx';

const REJECTION_CATEGORY_VALIDATION = 'validation';
const REJECTION_CATEGORY_PROTOCOL = 'protocol_violation';
const REJECTED_MESSAGE = 'Peg-in rejected by the Bridge';
const UNREFUNDABLE_MESSAGE = 'Sender protocol not honored; funds not refundable';
const UNKNOWN_REASON = 'UNKNOWN';
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
   * `amount` of `pegin_btc` / `lock_btc`, **in satoshis**. Absent on the
   * rejection path. Unlike the peg-out logs, whose `amount` is in weis, the
   * peg-in logs report satoshis directly, so no conversion applies here.
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
 * Unlike peg-out, a peg-in record is written once and never updated, so there
 * is a single emission per `btcTxId`. `LOCKED` produces just `swap.created`;
 * `swap.completed` is out of scope for now, which means a successful peg-in
 * stays PENDING on the analytics side.
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
    const locked = lockBtc ?? peginBtc;

    const context: PeginAtlasEventContext = {};
    if (locked) {
      context.amountInSatoshis = this.asString(locked.arguments.amount);
      context.rskRecipient = this.asString(locked.arguments.receiver);
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
   * A rejection yields two events: `swap.created` first, so the Worker has a
   * row carrying chains and assets, and `swap.rejected` right after. The order
   * of the array is the order they must be published in.
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
        return [this.envelope(pegin, AtlasEventType.SWAP_CREATED, this.createdData(context))];
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
      swap_id: pegin.btcTxId,
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
      wallet_address: context.senderBtcAddress ?? context.rskRecipient ?? null,
      wallet_type: null,
      quote_id: null,
    };
  }

  private static refundableRejection(context: PeginAtlasEventContext): SwapRejectedData {
    return {
      error_category: REJECTION_CATEGORY_VALIDATION,
      error_code: this.rejectionCode('PEGIN_REJECTION', context.rejectedReason),
      error_message: REJECTED_MESSAGE,
      refund_applicable: true,
    };
  }

  private static unrefundableRejection(context: PeginAtlasEventContext): SwapRejectedData {
    return {
      error_category: REJECTION_CATEGORY_PROTOCOL,
      error_code: this.rejectionCode('PEGIN_UNREFUNDABLE', context.unrefundableReason),
      error_message: UNREFUNDABLE_MESSAGE,
      refund_applicable: false,
    };
  }

  /**
   * Encodes a Bridge rejection reason as a stable error code.
   *
   * The numeric reasons of `rejected_pegin` / `unrefundable_pegin` are passed
   * through rather than translated: their meaning is not documented anywhere in
   * this repository and inventing names would put made-up semantics in the
   * analytics database. The codes stay distinguishable, so a mapping can be
   * added later without changing the shape of the event.
   *
   * @param prefix - Namespace of the code, which tells the two logs apart.
   * @param reason - The numeric reason as it came in the log.
   * @returns e.g. `PEGIN_REJECTION_3`, or `PEGIN_REJECTION_UNKNOWN` when absent.
   */
  private static rejectionCode(prefix: string, reason: string | undefined): string {
    const value = reason !== undefined && reason !== '' ? reason : UNKNOWN_REASON;
    return `${prefix}_${value}`;
  }

  private static inputAmount(context: PeginAtlasEventContext): string {
    if (context.amountInSatoshis === undefined) {
      // The rejection logs carry no amount. Zero is the honest value here: the
      // peg-in never converted, and the Worker reads volume from `completed`.
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
