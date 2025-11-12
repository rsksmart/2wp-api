import * as precompiledAbis from '@rsksmart/rsk-precompiled-abis';
import { ethers } from 'ethers';
import { BridgeService } from '../services';

const bridgeService = new BridgeService();
const bridgeContract = bridgeService.getBridgeContract();

// eslint-disable-next-line @typescript-eslint/naming-convention
export enum BRIDGE_METHODS {
  RELEASE_BTC = 'releaseBtc',
  REGISTER_BTC_TRANSACTION = 'registerBtcTransaction',
  UPDATE_COLLECTIONS = 'updateCollections',
  ADD_SIGNATURE = 'addSignature'
};

// eslint-disable-next-line @typescript-eslint/naming-convention
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
