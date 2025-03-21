import { BridgeMethod, Transaction} from '@rsksmart/bridge-transaction-parser';
import { RskTransaction } from '../models/rsk/rsk-transaction.model';
import {ExtendedBridgeEvent} from "../models/types/bridge-transaction-parser";

export default interface ExtendedBridgeTx extends Transaction {
  blockHash: string;
  createdOn: Date;
  to: string;
}

export class ExtendedBridgeTxModel implements ExtendedBridgeTx{
  constructor(transaction: Transaction, rskTransaction:RskTransaction) {
    this.blockHash = rskTransaction.blockHash;
    this.createdOn = rskTransaction.createdOn;
    this.to = rskTransaction.to;
    this.txHash = transaction.txHash;
    this.blockNumber = transaction.blockNumber;
    this.sender = transaction.sender;
    this.blockTimestamp = transaction.blockTimestamp;
    this.events = transaction.events as ExtendedBridgeEvent[];
    this.method = transaction.method;
  }

  blockHash: string;
  createdOn: Date;
  to: string;
  txHash: string;
  method: BridgeMethod;
  events: ExtendedBridgeEvent[];
  blockNumber: number;
  blockTimestamp: number;
  sender: string;
}
