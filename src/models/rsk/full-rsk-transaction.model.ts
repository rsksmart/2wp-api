import { TransactionInfo } from 'web3';

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


  public static fromWeb3TransactionWithValue(web3Tx: TransactionInfo): FullRskTransaction {
    const tx = new FullRskTransaction();
    tx.hash = web3Tx.hash?.toString() ?? '';
    tx.nonce = Number(web3Tx.nonce);
    tx.blockHash = web3Tx.blockHash?.toString() ?? '';
    tx.blockNumber = Number(web3Tx.blockNumber ?? -1);
    tx.transactionIndex = Number(web3Tx.transactionIndex ?? -1);
    tx.from = web3Tx.from;
    tx.to = web3Tx.to ?? '';
    tx.valueInWeis = String(web3Tx.value);
    tx.gas = Number(web3Tx.gas);
    tx.gasPriceInWeis = web3Tx.gasPrice?.toString() ?? '';
    tx.input = web3Tx.input?.toString() ?? '';

    return tx;
  }

}
