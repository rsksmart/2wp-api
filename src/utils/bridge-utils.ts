import * as precompiledAbis from '@rsksmart/rsk-precompiled-abis';
import { ethers } from 'ethers';
import type {TransactionReceipt} from 'web3';
import {MAX_BRIDGE_CALLDATA_BYTES} from '../config/resource-budgets';
import type {RskTransaction} from '../models/rsk/rsk-transaction.model';
import {
  assertWithinBudget,
  budgetExceededError,
  ResourceBudgetName,
} from './resource-budget';

/**
 * The Bridge ABI, read directly rather than through `BridgeService`.
 *
 * This module used to construct a `BridgeService` — and with it a JSON-RPC
 * provider — at import time, purely to reach `contract.interface`. That made a
 * pure ABI helper depend on the whole service layer, which in turn cannot import
 * it back: `bridge.service.ts` importing this file would have closed the cycle
 * while `new BridgeService()` was still evaluating. The interface is built from
 * the same ABI object either way, so nothing about the selectors changes; what
 * changes is that this file is now a leaf every layer can use, which is what
 * lets the calldata bound sit on both decode paths.
 */
const bridgeInterface = new ethers.Interface(precompiledAbis.bridge.abi);

export enum BRIDGE_METHODS {
  RELEASE_BTC = 'releaseBtc',
  REGISTER_BTC_TRANSACTION = 'registerBtcTransaction',
  UPDATE_COLLECTIONS = 'updateCollections',
  ADD_SIGNATURE = 'addSignature'
};

export enum BRIDGE_EVENTS {
  LOCK_BTC = 'lock_btc',
  PEGIN_BTC = 'pegin_btc',
  REJECTED_PEGIN = 'rejected_pegin',
  RELEASE_REQUESTED = 'release_requested',
  UNREFUNDABLE_PEGIN = 'unrefundable_pegin',
  UPDATE_COLLECTIONS = 'update_collections',
  RELEASE_BTC = 'release_btc',
  RELEASE_REQUEST_RECEIVED = 'release_request_received',
  RELEASE_REQUEST_REJECTED = 'release_request_rejected',
  ADD_SIGNATURE = 'add_signature',
  BATCH_PEGOUT_CREATED = 'batch_pegout_created',
  PEGOUT_CONFIRMED = 'pegout_confirmed'
};

export function getBridgeSignature(methodOrEvent: BRIDGE_METHODS | BRIDGE_EVENTS): string {
  // Try to get as function first (for methods)
  const method = bridgeInterface.getFunction(methodOrEvent);
  if (method) {
    return method.selector;
  }
  // If not a function, try to get as event (for events)
  const event = bridgeInterface.getEvent(methodOrEvent);
  if (event) {
    return event.topicHash;
  }
  throw new Error(methodOrEvent + " does not exist in Bridge abi");
}

export function getBridgeMethodABI(method: BRIDGE_METHODS): any {
  const abi = precompiledAbis.bridge.abi.find((m: any) => m.name === method);
  if (!abi) {
    throw new Error(method + " does not exist in Bridge abi");
  }
  return abi;
}

export function encodeBridgeMethodParameters(method: BRIDGE_METHODS, args: Array<any>): any {
  const abi = getBridgeMethodABI(method);
  const abiCoder = new ethers.AbiCoder();
  return abiCoder.encode(abi.inputs, args);
}

export function decodeBridgeMethodParameters(method: BRIDGE_METHODS, data: string): any {
  const abi = getBridgeMethodABI(method);
  const abiCoder = new ethers.AbiCoder();
  return abiCoder.decode(abi.inputs, data);
}

/**
 * Exactly one, written as text: decimal or hex, with any amount of zero padding.
 *
 * Anchored on purpose. A node that reports `'0x01'` means success as plainly as
 * one that reports `'0x1'`, and reading the first as a revert costs a legitimate
 * pegout its parse — a failure that is invisible except as a status that never
 * resolves. `'0x11'` and `'0x10'` are not successes, so a substring match would
 * be worse than the enumeration it replaces.
 *
 * The same predicate is being added to `@rsksmart/bridge-transaction-parser`
 * (release 3.1.0 of the upstream remediation). When that ships, consume it from
 * there rather than keeping two definitions of "this receipt succeeded".
 */
const SUCCESS_STATUS_TEXT = /^(?:0x)?0*1$/;

/**
 * Was this transaction receipt produced by a *successful* EVM execution?
 *
 * **This is not a resource control, and it never was.** It was documented as one:
 * the reasoning ran that a Bridge call only succeeds if RSKj accepted its
 * arguments as semantically valid — 80-byte block headers, real DER signatures,
 * real Bitcoin transactions — so a successful receipt bounds what the ABI decoder
 * can be made to allocate. That reasoning was checked against `receiveHeaders`,
 * which does reject oversized headers and revert, and generalized from there.
 *
 * It does not generalize. `registerFastBridgeBtcTransaction` wraps its entire
 * body in a catch that returns `GENERIC_ERROR` rather than reverting, so
 * adversarial calldata to that method produces a receipt with `status: 1` and
 * passes this predicate untouched. One method behaving one way says nothing
 * about the next. The bound that actually holds is
 * {@link assertBridgeCalldataWithinBudget}, which does not care what the EVM
 * decided.
 *
 * What this predicate is still for: a semantic filter. A reverted call produced
 * no events and describes no state change, so there is nothing worth decoding in
 * it, and a truthy receipt object says nothing about its status — testing only
 * `if (receipt)` reads a reverted transaction as a successful one. Keep it for
 * that, and do not lean on it for anything about size.
 *
 * Status arrives in different shapes depending on whether the receipt came from
 * web3 or ethers, so every known success representation is accepted. Anything
 * else — missing, unrecognized, or a shape we do not know how to read — is
 * treated as failed: this fails closed on purpose.
 *
 * @param receipt - Transaction receipt to inspect. May be `null`/`undefined`.
 * @returns `true` only when the receipt is definitely a successful execution.
 */
export function isSuccessfulReceipt(receipt: {status?: unknown} | null | undefined): boolean {
  if (!receipt) {
    return false;
  }
  const {status} = receipt;
  if (typeof status === 'string') {
    return SUCCESS_STATUS_TEXT.test(status);
  }
  return status === 1 || status === 1n || status === true;
}

/**
 * Well-formed transaction calldata: `0x` followed by whole bytes.
 *
 * `0x` alone is legitimate and must pass — sending value to the Bridge with no
 * calldata is how an ordinary pegout is requested.
 */
const WELL_FORMED_CALLDATA = /^0x([0-9a-fA-F]{2})*$/;

/**
 * Refuses to hand oversized calldata to the Bridge ABI decoder.
 *
 * ABI decoding amplifies calldata into heap by a measured ~225x, and the four
 * dynamic `bytes` parameters of a Bridge method may all point at the same blob,
 * so ~1.5 MiB of adversarial calldata is enough to abort the process with
 * `JavaScript heap out of memory`. A byte cap is the only control that holds
 * regardless of what the decoder does with the offsets inside.
 *
 * It must be applied to the calldata the decoder will actually read. Checking a
 * transaction the caller happens to hold, while the decoder re-fetches its own
 * copy, is advice rather than a control — see
 * `bridge-decode-equivalence.unit.ts`.
 *
 * Fails closed: anything that is not well-formed hex is refused, with an
 * observed size of `-1` to say "refused before it was measured" rather than
 * inventing a length. Nothing derived from the payload reaches the message, the
 * log line or the metric.
 *
 * @param data - Raw transaction calldata, `0x`-prefixed.
 * @param opts - `route` for the observability signal, `limit` to override the
 *   configured budget (tests, and callers with a tighter ceiling).
 * @throws {HttpErrors.PayloadTooLarge} When the calldata is oversized or malformed.
 */
export function assertBridgeCalldataWithinBudget(
  data: string | undefined,
  opts: {route?: string; limit?: number} = {},
): void {
  const limit = opts.limit ?? MAX_BRIDGE_CALLDATA_BYTES;
  const malformed = () => {
    throw budgetExceededError({
      resource: ResourceBudgetName.BRIDGE_CALLDATA_BYTES,
      configuredLimit: limit,
      observedValue: -1,
      route: opts.route,
      detail: 'calldata is not well-formed hex',
    });
  };

  // Structural checks first, then the size, then the character set. The last
  // one is the only linear scan of the payload, and this ordering keeps it from
  // running on the oversized input the size check is there to refuse.
  if (typeof data !== 'string' || !data.startsWith('0x') || data.length % 2 !== 0) {
    malformed();
    return;
  }
  assertWithinBudget({
    resource: ResourceBudgetName.BRIDGE_CALLDATA_BYTES,
    configuredLimit: limit,
    observedValue: (data.length - 2) / 2,
    route: opts.route,
  });
  if (!WELL_FORMED_CALLDATA.test(data)) {
    malformed();
  }
}

/**
 * The transaction shape `decodeBridgeTransaction` reads.
 *
 * Only `hash` and `data` are consumed, but naming them is the point: the parser
 * decodes exactly the calldata we validated, not a copy it fetched itself.
 */
export interface ParserTransaction {
  hash: string;
  data: string;
}

/** The receipt shape `decodeBridgeTransaction` and `createBridgeTx` read. */
export interface ParserReceipt {
  hash: string;
  to: string;
  from: string;
  blockNumber: number;
  logs: unknown[];
}

/**
 * Adapts an `RskTransaction` to what the parser expects.
 *
 * @param tx - The transaction this service already fetched and validated.
 * @returns The parser-shaped transaction.
 */
export function toParserTx(tx: RskTransaction): ParserTransaction {
  return {hash: tx.hash, data: tx.data};
}

/**
 * Adapts a web3 receipt to the ethers shape the parser expects.
 *
 * Three differences matter, and each one is pinned by a test:
 *
 * - web3 names the transaction hash `transactionHash`. The parser compares
 *   `bridgeTx.hash` to `bridgeTxReceipt.hash`, so the raw web3 receipt fails
 *   that guard before any decoding happens — every real pegout would turn into
 *   an error.
 * - web3 returns `blockNumber` as a `bigint`, and the parser passes it straight
 *   to `provider.getBlock`.
 * - ethers checksums `from`; web3 does not. That value becomes `sender` on the
 *   decoded transaction and then `rskSenderAddress` in this API's responses, so
 *   forwarding the lowercase form would change what callers see.
 *
 * Checksumming is normalization, not validation: an address ethers cannot parse
 * is passed through rather than thrown on, so an unexpected node response costs
 * a legitimate pegout nothing.
 *
 * @param receipt - Receipt as returned by `web3.eth.getTransactionReceipt`.
 * @returns The parser-shaped receipt.
 */
export function toParserReceipt(receipt: TransactionReceipt): ParserReceipt {
  const from = String(receipt.from ?? '');
  let checksummed = from;
  try {
    checksummed = ethers.getAddress(from);
  } catch {
    // Not an address we can normalize. Hand it on unchanged.
  }
  return {
    hash: String(receipt.transactionHash ?? ''),
    to: String(receipt.to ?? ''),
    from: checksummed,
    blockNumber: Number(receipt.blockNumber),
    logs: (receipt.logs ?? []) as unknown[],
  };
}

/**
 * Empty calldata: value sent to the Bridge with no method call.
 *
 * That is how an ordinary pegout is requested, so it belongs on the allowlist
 * as much as any named method.
 */
export const EMPTY_CALLDATA_SELECTOR = '0x';

/** The Bridge methods the pegout path is built to understand. */
export const PEGOUT_ROUTE_METHODS: readonly BRIDGE_METHODS[] = [
  BRIDGE_METHODS.UPDATE_COLLECTIONS,
  BRIDGE_METHODS.ADD_SIGNATURE,
  BRIDGE_METHODS.RELEASE_BTC,
];

/**
 * The one definition of "a selector the pegout path decodes".
 *
 * `PegoutDataProcessor.getFilters()` builds its filters from this set rather
 * than restating the list. `docs/resource-budgets.md` already warns that these
 * selectors are load-bearing — filtering happens before the decode, so a
 * selector drifting between two definitions would stop indexing a method rather
 * than merely decoding it and discarding the result. A second hand-written copy
 * is that drift waiting to happen.
 */
export const PEGOUT_ROUTE_SELECTORS: ReadonlySet<string> = new Set([
  EMPTY_CALLDATA_SELECTOR,
  ...PEGOUT_ROUTE_METHODS.map(getBridgeSignature),
]);

/**
 * The 4-byte selector a filter would match on, read the same way
 * `BridgeDataFilterModel.isMethodCall` reads it.
 */
const selectorOf = (data: string): string => data.slice(0, 10);

/**
 * Refuses to decode a Bridge method this route has no reason to understand.
 *
 * Defence in depth behind the size bound, and aimed at a specific method:
 * `registerFastBridgeBtcTransaction` is permissionless, is not a pegout method,
 * and is what the hostile payload rides on. `getBtcTransactionConfirmations` and
 * `receiveHeaders` are permissionless too. The size bound already covers all
 * three; refusing them by selector makes that coverage intentional rather than
 * incidental, and keeps a future decoder bug on one of those methods out of
 * reach of an unauthenticated route.
 *
 * Fails closed: calldata with no readable selector is refused. The message names
 * the selector — ten characters, a public method id — and nothing behind it.
 *
 * @param data - Raw transaction calldata, `0x`-prefixed.
 * @param allowed - The selectors this route decodes. Defaults to the pegout set.
 * @throws {Error} When the selector is not on the allowlist.
 */
export function assertBridgeSelectorAllowed(
  data: string | undefined,
  allowed: ReadonlySet<string> = PEGOUT_ROUTE_SELECTORS,
): void {
  if (typeof data !== 'string' || !data.startsWith('0x')) {
    throw new Error('Bridge calldata carries no readable selector');
  }
  const selector = selectorOf(data);
  if (!allowed.has(selector)) {
    throw new Error(
      `Bridge selector ${selector} is not decodable on this route`,
    );
  }
}
