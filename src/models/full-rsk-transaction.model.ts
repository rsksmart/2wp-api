import { Transaction  } from 'web3-eth';

export class FullRskTransaction {
  hash: string;
  nonce: number;
  blockHash: string;
  blockNumber: number;
  transactionIndex: number;
  from: string;
  to: string;
  valueInWeis: string;
  gas: number;
  gasPriceInWeis: string;
  input: string;


  public static fromWeb3TransactionWithValue(web3Tx: Transaction): FullRskTransaction {
    const tx = new FullRskTransaction();
    tx.hash = web3Tx.hash;
    tx.nonce = web3Tx.nonce;
    tx.blockHash = web3Tx.blockHash ?? '';
    tx.blockNumber = web3Tx.blockNumber ?? -1;
    tx.transactionIndex = web3Tx.transactionIndex ?? -1;
    tx.from = web3Tx.from;
    tx.to = <string> web3Tx.to;
    tx.valueInWeis = web3Tx.value;
    tx.gas = web3Tx.gas;
    tx.gasPriceInWeis = web3Tx.gasPrice;
    tx.input = web3Tx.input;

    return tx;
  }

}
