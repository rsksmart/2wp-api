import {Transaction} from 'bridge-transaction-parser';

export default interface ExtendedBridgeTx extends Transaction {
  blockHash: string;
  createdOn: Date;
  to: string;
}
