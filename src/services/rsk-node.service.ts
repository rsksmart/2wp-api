import Web3 from 'web3';

export class RskNodeService {
  web3: Web3;
  constructor() {
    this.web3 = new Web3(`${process.env.RSK_NODE_HOST}`);
  }
  /** getBlock returns the block with its internal transactions */
  getBlock(block: string | number): Promise<any> {
    return this.web3.eth.getBlock(block, true);
  }
  getTransactionReceipt(txHash: string): Promise<any> {
    return this.web3.eth.getTransactionReceipt(txHash);
  }
}
