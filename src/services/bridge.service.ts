import {bridge} from '@rsksmart/rsk-precompiled-abis';
import {getLogger, Logger} from 'log4js';
import Web3 from 'web3';
import {ethers} from 'ethers';
import {Contract} from 'web3-eth-contract';
import BridgeTransactionParser, {Transaction} from '@rsksmart/bridge-transaction-parser';
import { getBridgeState, BridgeState } from '@rsksmart/bridge-state-data-parser';
import * as constants from '../constants';

export class BridgeService {
  private bridgeContract: Contract;
  private web3: Web3;
  private TOTAL_RBTC_STOCK = 21000000;
  private host: string;
  private ethersProvider: ethers.JsonRpcProvider;
  private bridgeTransactionParser: BridgeTransactionParser;
  logger: Logger;
  constructor() {
    this.web3 = new Web3(`${process.env.RSK_NODE_HOST}`);
    this.bridgeContract = bridge.build(this.web3);
    this.host = process.env.RSK_NODE_HOST ?? constants.TESTNET_RSK_NODE_HOST;
    this.ethersProvider = new ethers.JsonRpcProvider(this.host);
    this.bridgeTransactionParser = new BridgeTransactionParser(this.ethersProvider);
    this.logger = getLogger('bridge-service');
  }

  public getFederationAddress(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.bridgeContract.methods
        .getFederationAddress()
        .call()
        .then((address: string) => {
          resolve(address);
        })
        .catch((reason: any) => {
          this.logger.warn(`[getFederationAddress] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }

  public getMinPeginValue(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.bridgeContract.methods
        .getMinimumLockTxValue()
        .call()
        .then((minValue: string) => resolve(Number(minValue)))
        .catch((reason: any) => {
          this.logger.warn(`[getMinPeginValue] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }

  public getLockingCapAmount(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.bridgeContract.methods
        .getLockingCap()
        .call()
        .then((lockingCap: string) => resolve(Number(lockingCap)))
        .catch((reason: any) => {
          this.logger.warn(`[getLockingCapAmount] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }

  public getRbtcInCirculation(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.web3.eth
        .getBalance(bridge.address)
        .then((balance: string) => {
          const amount =
            Number(
              this.web3.utils.toWei(
                this.web3.utils.toBN(this.TOTAL_RBTC_STOCK),
              ),
            ) - Number(balance);
          resolve(amount);
        })
        .catch(reason => {
          this.logger.warn(`[getRbtcInCirculation] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }

  public getPeginAvailability(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      Promise.all([this.getLockingCapAmount(), this.getRbtcInCirculation()])
        .then(([lockingCap, rbtcInCirculation]) => {
          const rbtcInCirculationToSatoshis = Math.round(rbtcInCirculation / 1e10);
          let availability = lockingCap - rbtcInCirculationToSatoshis;
          availability = availability > 0 ? availability : 0
          const maxAllowed = process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI
            ? Number(process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI) : Infinity;
          resolve(Math.min(availability, maxAllowed));
        })
        .catch(reason => {
          this.logger.warn(`[getPeginAvailability] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }

  public async isBtcTxHashAlreadyProcessed(txHash: string): Promise<Boolean> {
    return new Promise<Boolean>((resolve, reject) => {
      this.bridgeContract.methods
        .isBtcTxHashAlreadyProcessed(txHash)
        .call()
        .then((isProcessed: Boolean) => resolve(isProcessed))
        .catch((reason: any) => {
          this.logger.warn(`[isBtcTxHashAlreadyProcessed] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }

  public async getBridgeTransactionByHash(txHash: string): Promise<Transaction> {
    return await this.bridgeTransactionParser.getBridgeTransactionByTxHash(txHash);
  }

  public async getBridgeState(defaultBlock: string | number = 'latest'): Promise<BridgeState> {
    return await getBridgeState(this.host, defaultBlock);
  }

}
