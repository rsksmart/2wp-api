import BridgeTransactionParser, { Transaction } from '@rsksmart/bridge-transaction-parser';
import Web3, { Block } from 'web3';
import { ethers } from 'ethers';
import { RskTransaction } from '../models/rsk/rsk-transaction.model';
import {
  assertBridgeCalldataWithinBudget,
  toParserReceipt,
  toParserTx,
} from '../utils/bridge-utils';
import * as constants from '../constants';

/** Operation label for the budget's observability signal. */
export const BRIDGE_DECODE_ROUTE = 'bridge-decode';

export class RskNodeService {
  web3: Web3;
  host: string;
  ethersProvider: ethers.JsonRpcProvider;
  bridgeTransactionParser: BridgeTransactionParser;

  constructor() {
    this.web3 = new Web3(`${process.env.RSK_NODE_HOST}`);
    this.host = process.env.RSK_NODE_HOST ?? constants.TESTNET_RSK_NODE_HOST;
    this.ethersProvider = new ethers.JsonRpcProvider(this.host);
    this.bridgeTransactionParser = new BridgeTransactionParser(this.ethersProvider);
  }
  getBlock(block: string | number): Promise<Block> {
    return this.web3.eth.getBlock(block, true);
  }
  getTransactionReceipt(txHash: string): Promise<any> {
    return this.web3.eth.getTransactionReceipt(txHash);
  }
  async getBlockNumber(): Promise<number> {
    const blockNumber = await this.web3.eth.getBlockNumber();
    return Number(blockNumber);
  }
  /**
   * Decodes a Bridge transaction this service already fetched.
   *
   * Takes the transaction rather than its hash on purpose. The parser's
   * `getBridgeTransactionByTxHash` re-fetches the transaction itself, so a
   * calldata check on the object a caller held constrained nothing it decoded —
   * it was advice, not a control. Handing the parser the bytes we validated is
   * what closes that gap, and it removes two duplicate RPC round trips per
   * request along the way.
   *
   * @param tx - The transaction, with its receipt attached when it is mined.
   * @returns The decoded Bridge transaction, or `undefined` when there is no
   *   receipt to decode against.
   * @throws {HttpErrors.PayloadTooLarge} When the calldata exceeds its budget.
   */
  async getBridgeTransaction(tx: RskTransaction): Promise<Transaction | undefined> {
    assertBridgeCalldataWithinBudget(tx.data, {route: BRIDGE_DECODE_ROUTE});
    if (!tx.receipt) {
      return undefined;
    }
    return this.bridgeTransactionParser.decodeBridgeTransaction(
      toParserTx(tx) as never,
      toParserReceipt(tx.receipt) as never,
    );
  }
  /**
   * Fetches a transaction, optionally with its receipt attached.
   *
   * Written as `async` rather than a hand-rolled promise executor on purpose:
   * the executor shape is what allowed a branch to settle neither way, leaving
   * the caller — and the HTTP request behind it — waiting forever.
   *
   * @param txHash - Transaction hash to look up.
   * @param includeReceipt - Attach the receipt when the transaction is mined.
   * @returns The transaction, with `receipt` set only when the node returned one.
   * @throws {Error} If the node does not know the transaction, or the receipt call fails.
   */
  async getTransaction(
    txHash: string,
    includeReceipt?: boolean,
  ): Promise<RskTransaction> {
    const web3Tx = await this.web3.eth.getTransaction(txHash);
    if (!web3Tx) {
      throw new Error('Tx not found in RSK node.');
    }

    const rskTx = new RskTransaction();
    rskTx.blockHash = web3Tx.blockHash ?? '';
    rskTx.hash = web3Tx.hash;
    rskTx.data = web3Tx.input;
    rskTx.to = web3Tx.to ?? '';
    rskTx.value = Number(web3Tx.value);
    rskTx.from = web3Tx.from;

    const isMined = !!web3Tx.blockHash && !!web3Tx.blockNumber;
    if (!isMined || !includeReceipt) {
      return rskTx;
    }

    // An absent receipt for a mined transaction is an answer, not a missing one:
    // a reorg between the two calls, or a lagging node in a load-balanced fleet,
    // both produce it. Callers already read a receipt-less transaction as
    // pending, so returning it is correct and — unlike waiting — terminates.
    const receipt = await this.getTransactionReceipt(rskTx.hash);
    if (receipt) {
      rskTx.receipt = receipt;
    }
    return rskTx;
  }
}
