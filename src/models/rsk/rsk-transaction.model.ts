import { BlockTransactionObject, Transaction, TransactionReceipt  } from 'web3-eth';

export class RskTransaction {
  hash: string;
  blockHash: string;
  blockHeight: number;
  data: string;
  createdOn: Date;
  to: string;
  receipt: TransactionReceipt | null;

  public static fromWeb3Transaction(web3Block: BlockTransactionObject, web3Tx: Transaction): RskTransaction {
    const tx = new RskTransaction();
    tx.blockHeight = web3Block.number;
    tx.blockHash = web3Block.hash;
    tx.createdOn = new Date(Number(web3Block.timestamp) * 1000);
    tx.hash = web3Tx.hash;
    tx.data = web3Tx.input;
    tx.to = <string> web3Tx.to;
    return tx;
  }

}
