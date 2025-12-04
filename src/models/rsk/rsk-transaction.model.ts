import { Block, TransactionInfo, TransactionReceipt } from 'web3';

export class RskTransaction {
  hash: string;
  blockHash: string;
  blockHeight: number;
  data: string;
  createdOn: Date;
  value?: number;
  from?: string;
  to: string;
  receipt: TransactionReceipt | null;

  public static fromWeb3Transaction(web3Block: Block, web3Tx: TransactionInfo): RskTransaction {
    const tx = new RskTransaction();
    tx.blockHeight = Number(web3Block.number);
    tx.blockHash = web3Block.hash?.toString() ?? '';
    tx.createdOn = new Date(Number(web3Block.timestamp) * 1000);
    tx.hash = web3Tx.hash?.toString() ?? '';
    tx.data = web3Tx.input?.toString() ?? '';
    tx.to = web3Tx.to ?? '';
    return tx;
  }

}
