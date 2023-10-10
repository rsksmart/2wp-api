import { getBridgeTransactionByTxHash, Transaction } from 'bridge-transaction-parser';
import Web3 from 'web3';
import { BlockTransactionObject } from 'web3-eth';
import { RskTransaction } from '../models/rsk/rsk-transaction.model';

export class RskNodeService {
  web3: Web3;

  constructor() {
    this.web3 = new Web3(`${process.env.RSK_NODE_HOST}`);
  }
  getBlock(block: string | number): Promise<BlockTransactionObject> {
    return this.web3.eth.getBlock(block, true);
  }
  getTransactionReceipt(txHash: string): Promise<any> {
    return this.web3.eth.getTransactionReceipt(txHash);
  }
  getBlockNumber(): Promise<number> {
    return this.web3.eth.getBlockNumber();
  }
  getBridgeTransaction(txHash: string): Promise<Transaction> {
    return getBridgeTransactionByTxHash(this.web3, txHash);
  }
  getTransaction(txHash: string, includeReceipt?:boolean): Promise<RskTransaction> {
    const rskTx = new RskTransaction();
    return new Promise<RskTransaction>((resolve, reject) => {
      this.web3.eth.getTransaction(txHash)
        .then((web3Tx) => {
          if (!web3Tx) return reject(new Error('Tx not found in RSK node.'));

          rskTx.blockHash = <string> web3Tx.blockHash;
          rskTx.hash = <string> web3Tx.hash;
          rskTx.data = <string> web3Tx.input;
          rskTx.to = <string> web3Tx.to;
          rskTx.value = <number> Number(web3Tx.value);
          rskTx.from = <string> web3Tx.from;

          if(!web3Tx.blockHash || !web3Tx.blockNumber) return resolve(rskTx);

          if(includeReceipt) {
            this.getTransactionReceipt(rskTx.hash)
            .then((receipt) => {
              if(receipt) {
                rskTx.receipt = receipt;
                return resolve(rskTx);
              }
            })
            .catch((reason) => {
              return reject(reason);
            });
          } else {
            return resolve(rskTx);
          }
          })
          .catch((reason) => {
            return reject(reason);
          });
        });
  }
}
