import {ChainId} from './atlas-chain';

/**
 * Event types of the Atlas SWAP Event Schema v1.0 emitted for native pegs.
 * `expired`, `refund_pending`, `refunded`, `claim_pending` and `claimed` do not
 * apply to native peg-in / peg-out and are therefore out of scope.
 *
 * Peg-in only reaches `swap.created` and `swap.rejected`: the daemon observes
 * Rootstock alone, so the deposit on Bitcoin is never seen and `swap.pending`
 * has no trigger. `swap.completed` is deliberately left out for now.
 */
export enum AtlasEventType {
  SWAP_CREATED = 'swap.created',
  SWAP_PENDING = 'swap.pending',
  SWAP_COMPLETED = 'swap.completed',
  SWAP_REJECTED = 'swap.rejected',
}

export const ATLAS_SCHEMA_VERSION = '1.0';
export const ATLAS_SOURCE = 'PWP';
export const ATLAS_SWAP_TYPE = 'powpeg';
export const ATLAS_PROVIDER = 'powpeg';
/** Assets of the BTC <-> RBTC pair. Which one is input and which is output
 * depends on the direction, so each builder pairs them itself. */
export const ASSET_BTC = 'BTC';
export const ASSET_RBTC = 'RBTC';

export interface SwapCreatedData {
  provider: string;
  source_chain: ChainId;
  destination_chain: ChainId;
  input_asset: string;
  output_asset: string;
  input_amount: string;
  input_amount_usd: null;
  /** Null when the Bridge log carries no address, as in a rejected peg-in. */
  wallet_address: string | null;
  wallet_type: null;
  quote_id: null;
}

export interface SwapPendingData {
  source_tx_hash: string;
  deposit_address: null;
  expected_confirmations: number;
}

export interface SwapCompletedData {
  destination_tx_hash: string;
  output_amount: string;
  output_amount_usd: null;
  fee: string;
  duration_ms: number | null;
}

export interface SwapRejectedData {
  error_category: string;
  error_code: string;
  error_message: string;
  refund_applicable: boolean;
}

export type AtlasEventData =
  | SwapCreatedData
  | SwapPendingData
  | SwapCompletedData
  | SwapRejectedData;

export interface AtlasEvent<T extends AtlasEventData = AtlasEventData> {
  event_id: string;
  event_type: AtlasEventType;
  /** Always the `originatingRskTxHash`, never the mutated `rskTxHash`. */
  swap_id: string;
  swap_type: string;
  source: string;
  schema_version: string;
  /** ISO 8601 UTC timestamp of the Rootstock transaction that caused the transition. */
  emitted_at: string;
  data: T;
}
