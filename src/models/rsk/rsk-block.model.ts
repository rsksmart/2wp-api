import { RskTransaction } from './rsk-transaction.model';
import { BlockTransactionObject } from 'web3-eth';
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

  public static fromWeb3Block(web3Block: BlockTransactionObject): RskBlock {
    return new RskBlock(
      web3Block.number,
      web3Block.hash,
      web3Block.parentHash,
      []
    );
  }

  public static fromWeb3BlockWithTransactions(web3Block: BlockTransactionObject): RskBlock {
    const rskTransactions: RskTransaction[] = web3Block.transactions.map(tx => RskTransaction.fromWeb3Transaction(web3Block, tx));
    return new RskBlock(
      web3Block.number,
      web3Block.hash,
      web3Block.parentHash,
      rskTransactions
    );
  }

}

