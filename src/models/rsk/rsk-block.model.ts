import { Block, TransactionInfo } from 'web3';
import { RskTransaction } from './rsk-transaction.model';

export class RskBlock {
  readonly height: number;
  readonly hash: string;
  readonly parentHash: string;
  readonly transactions: RskTransaction[];

  constructor(
    height: number,
    hash: string,
    parentHash: string,
    transactions: RskTransaction[] = []
  ) {
    this.height = height;
    this.hash = hash;
    this.parentHash = parentHash;
    this. transactions = transactions;
  }

  public toString(): string {
    return `{hash:${this.hash}, parentHash:${this.parentHash}, height:${this.height}}`;
  }

  public static fromWeb3Block(web3Block: Block): RskBlock {
    return new RskBlock(
      Number(web3Block.number),
      web3Block.hash?.toString() ?? '',
      web3Block.parentHash?.toString() ?? '',
      []
    );
  }

  public static fromWeb3BlockWithTransactions(web3Block: Block): RskBlock {
    const { transactions } = web3Block;

    const hasTxInfo = (tx: unknown): tx is TransactionInfo =>
      typeof tx === 'object' && tx !== null && 'hash' in tx;

    const rskTransactions = transactions
      .filter(hasTxInfo)
      .map(tx => RskTransaction.fromWeb3Transaction(web3Block, tx));

    return new RskBlock(
      Number(web3Block.number),
      web3Block.hash?.toString() ?? '',
      web3Block.parentHash?.toString() ?? '',
      rskTransactions
    );
  }

}

