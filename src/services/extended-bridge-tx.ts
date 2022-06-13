import {BridgeEvent, BridgeMethod, Transaction} from 'bridge-transaction-parser';
import { RskTransaction } from '../models/rsk/rsk-transaction.model';

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
    this.events = transaction.events;
    this.method = transaction.method;
  }

  blockHash: string;
  createdOn: Date;
  to: string;
  txHash: string;
  method: BridgeMethod;
  events: BridgeEvent[];
  blockNumber: number;
}
