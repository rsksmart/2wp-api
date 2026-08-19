import * as precompiledAbis from '@rsksmart/rsk-precompiled-abis';
import { ethers } from 'ethers';
import { BridgeService } from '../services';

const bridgeService = new BridgeService();
const bridgeContract = bridgeService.getBridgeContract();

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
  const method = bridgeContract.interface.getFunction(methodOrEvent);
  if (method) {
    return method.selector;
  }
  // If not a function, try to get as event (for events)
  const event = bridgeContract.interface.getEvent(methodOrEvent);
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
 * Was this transaction receipt produced by a *successful* EVM execution?
 *
 * This is the control that keeps adversarial Bridge calldata away from
 * `decodeFunctionData`. A Bridge call only succeeds if RSKj accepted its
 * arguments as semantically valid — 80-byte block headers, real DER signatures,
 * real Bitcoin transactions — so a successful receipt bounds how much the ABI
 * decoder can be made to allocate. A reverted call proves nothing about its
 * arguments, and a truthy receipt object says nothing about its status. Testing
 * only `if (receipt)` therefore lets a reverted transaction reach the decoder,
 * where adversarial calldata can trigger an unrecoverable out-of-memory abort.
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
  return status === 1 || status === 1n || status === true
    || status === '0x1' || status === '1';
}
