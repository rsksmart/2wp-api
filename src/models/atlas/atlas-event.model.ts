import {ChainId} from './atlas-chain';

/**
 * Event types of the Atlas SWAP Event Schema v1.0 emitted for native peg-out.
 * `expired`, `refund_pending`, `refunded`, `claim_pending` and `claimed` do not
 * apply to native peg-out and are therefore out of scope.
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
export const ATLAS_INPUT_ASSET = 'RBTC';
export const ATLAS_OUTPUT_ASSET = 'BTC';

export interface SwapCreatedData {
  provider: string;
  source_chain: ChainId;
  destination_chain: ChainId;
  input_asset: string;
  output_asset: string;
  input_amount: string;
  input_amount_usd: null;
  wallet_address: string;
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
