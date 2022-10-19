import { BridgeMethod, Transaction} from 'bridge-transaction-parser';
import { RskTransaction } from '../models/rsk/rsk-transaction.model';
import {ExtendedBridgeEvent} from '../models/types/bridge-transaction-parser';

export default interface ExtendedBridgeTx extends Transaction {
  blockHash: string;
  createdOn: Date;
  to: string;
}

export class ExtendedBridgeTxModel implements ExtendedBridgeTx {
  constructor(transaction: Transaction, rskTransaction:RskTransaction) {
    this.blockHash = rskTransaction.blockHash;
    this.createdOn = rskTransaction.createdOn;
    this.to = rskTransaction.to;
    this.txHash = transaction.txHash;
    this.blockNumber = transaction.blockNumber;
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
}
