import {getLogger, Logger} from '../../utils/logger';
import {
  ASSET_RBTC,
  ASSET_BTC,
  ATLAS_PROVIDER,
  ATLAS_SCHEMA_VERSION,
  ATLAS_SOURCE,
  ATLAS_SWAP_TYPE,
  AtlasEvent,
  AtlasEventData,
  AtlasEventType,
  SwapCompletedData,
  SwapCreatedData,
  SwapPendingData,
  SwapRejectedData,
} from '../../models/atlas/atlas-event.model';
import {resolvePegoutChainIds} from '../../models/atlas/atlas-chain';
import {satoshisToDecimalString} from '../../models/atlas/atlas-amount';
import {normalizeAddress, normalizeSwapId} from '../../models/atlas/atlas-identifiers';
import {atlasEventId} from '../../models/atlas/atlas-event-id';
import {
  PegoutStatusDbDataModel,
  PegoutStatuses,
} from '../../models/rsk/pegout-status-data-model';

const logger: Logger = getLogger('pegoutAtlasEventBuilder');

const REJECTION_ERROR_CATEGORY = 'validation';
const REJECTION_ERROR_MESSAGE = 'Pegout request rejected by the Bridge';
const UNKNOWN_REJECTION_REASON = 'UNKNOWN';

export interface PegoutAtlasEventContext {
  /**
   * `createdOn` of the `RECEIVED` status of the same peg-out. Only used to
   * compute `duration_ms` of `swap.completed`; when absent the field travels null.
   */
  receivedCreatedOn?: Date;
}

/**
 * Turns a persisted peg-out status into the Atlas SWAP event that its
 * transition represents.
 */
export class PegoutAtlasEventBuilder {

  /**
   * Formats an amount in satoshis as a fixed 8-decimal string.
   *
   * @param satoshis - Amount in satoshis. Nullish values are treated as zero.
   * @returns The amount in BTC/RBTC, e.g. `"0.12345678"`.
   */
  public static toDecimalAmount(satoshis: number | undefined | null): string {
    return satoshisToDecimalString(satoshis);
  }

  /**
   * Builds the Atlas event matching the status of `pegout`, or `null` when the
   * status has no equivalent in the v1.0 schema (e.g. `WAITING_FOR_SIGNATURE`).
   *
   * @param pegout - The peg-out status just written to the database.
   * @param context - Extra data that cannot be derived from `pegout` alone.
   * @returns The event to publish, or `null` when the status is out of scope.
   */
  public static build(
    pegout: PegoutStatusDbDataModel,
    context: PegoutAtlasEventContext = {},
  ): AtlasEvent | null {
    switch (pegout.status) {
      case PegoutStatuses.RECEIVED:
        return this.envelope(pegout, AtlasEventType.SWAP_CREATED, this.createdData(pegout));
      case PegoutStatuses.WAITING_FOR_CONFIRMATION:
        return this.envelope(pegout, AtlasEventType.SWAP_PENDING, this.pendingData(pegout));
      case PegoutStatuses.RELEASE_BTC:
        return this.envelope(
          pegout,
          AtlasEventType.SWAP_COMPLETED,
          this.completedData(pegout, context),
        );
      case PegoutStatuses.REJECTED:
        return this.envelope(pegout, AtlasEventType.SWAP_REJECTED, this.rejectedData(pegout));
      default:
        return null;
    }
  }

  private static envelope(
    pegout: PegoutStatusDbDataModel,
    eventType: AtlasEventType,
    data: AtlasEventData,
  ): AtlasEvent {
    const swapId = normalizeSwapId(pegout.originatingRskTxHash);
    return {
      // Derived, never random: it travels as the SQS MessageDeduplicationId,
      // which a random value would leave nothing to deduplicate on. `rskTxHash`
      // is the right third part for the reason the next comment gives.
      event_id: atlasEventId(swapId, eventType, pegout.rskTxHash),
      event_type: eventType,
      // Never `rskTxHash`: the processor mutates it to disambiguate batches.
      swap_id: swapId,
      swap_type: ATLAS_SWAP_TYPE,
      source: ATLAS_SOURCE,
      schema_version: ATLAS_SCHEMA_VERSION,
      emitted_at: new Date(pegout.createdOn).toISOString(),
      data,
    };
  }

  private static createdData(pegout: PegoutStatusDbDataModel): SwapCreatedData {
    const {sourceChain, destinationChain} = resolvePegoutChainIds();
    return {
      provider: ATLAS_PROVIDER,
      source_chain: sourceChain,
      destination_chain: destinationChain,
      input_asset: ASSET_RBTC,
      output_asset: ASSET_BTC,
      input_amount: this.toDecimalAmount(pegout.valueRequestedInSatoshis),
      input_amount_usd: null,
      wallet_address: normalizeAddress(pegout.rskSenderAddress),
      wallet_type: null,
      quote_id: null,
    };
  }

  private static pendingData(pegout: PegoutStatusDbDataModel): SwapPendingData {
    return {
      source_tx_hash: normalizeSwapId(pegout.originatingRskTxHash),
      deposit_address: null,
      // Counted in Rootstock blocks, not Bitcoin ones.
      expected_confirmations: this.expectedConfirmations(),
    };
  }

  private static completedData(
    pegout: PegoutStatusDbDataModel,
    context: PegoutAtlasEventContext,
  ): SwapCompletedData {
    const requested = pegout.valueRequestedInSatoshis ?? 0;
    const received = pegout.valueInSatoshisToBeReceived ?? 0;
    return {
      destination_tx_hash: pegout.btcTxHash,
      output_amount: this.toDecimalAmount(received),
      output_amount_usd: null,
      fee: this.toDecimalAmount(this.feeSatoshis(pegout, requested, received)),
      duration_ms: this.durationMs(pegout, context),
    };
  }

  private static rejectedData(pegout: PegoutStatusDbDataModel): SwapRejectedData {
    return {
      error_category: REJECTION_ERROR_CATEGORY,
      error_code: pegout.reason ?? UNKNOWN_REJECTION_REASON,
      error_message: REJECTION_ERROR_MESSAGE,
      // The Bridge returns the RBTC to the sender in the rejection transaction
      // itself: there is no observable refund branch to wait for.
      refund_applicable: false,
    };
  }

  private static durationMs(
    pegout: PegoutStatusDbDataModel,
    {receivedCreatedOn}: PegoutAtlasEventContext,
  ): number | null {
    if (!receivedCreatedOn) {
      return null;
    }
    const elapsed = new Date(pegout.createdOn).getTime() - new Date(receivedCreatedOn).getTime();
    return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null;
  }

  /**
   * The peg-out fee, in satoshis, never below zero.
   *
   * `fee` is a `decimalAmount` in the schema and its pattern admits no minus
   * sign, so a batch whose output was matched to the wrong peg-out — or a
   * corrupted status row — would otherwise produce an event that fails
   * validation on the Atlas side. Reporting zero keeps the transition in the
   * dataset; the warning is what says the numbers behind it cannot be trusted.
   *
   * @param pegout - The peg-out the amounts were read from, for the log.
   * @param requested - Amount the user asked to release, in satoshis.
   * @param received - Amount the Bitcoin output actually pays, in satoshis.
   * @returns `requested - received`, or 0 when that difference is negative.
   */
  private static feeSatoshis(
    pegout: PegoutStatusDbDataModel,
    requested: number,
    received: number,
  ): number {
    const fee = requested - received;
    if (fee < 0) {
      logger.warn(
        {
          method: 'feeSatoshis',
          originatingRskTxHash: pegout.originatingRskTxHash,
          requested,
          received,
        },
        'Peg-out received more than it requested, reporting a zero fee',
      );
      return 0;
    }
    return fee;
  }

  /**
   * Confirmations the schema expects a peg-out to wait for, never below zero.
   *
   * `expected_confirmations` is an `integer` with `minimum: 0`, so a negative
   * `RSK_PEGOUT_MINIMUM_CONFIRMATIONS` is as invalid as a missing one and is
   * treated the same way.
   *
   * @returns The configured confirmations, or 0 when unset or not a
   * non-negative number.
   */
  private static expectedConfirmations(): number {
    const configured = parseInt(process.env.RSK_PEGOUT_MINIMUM_CONFIRMATIONS ?? '', 10);
    if (!Number.isFinite(configured) || configured < 0) {
      return 0;
    }
    return configured;
  }

}
