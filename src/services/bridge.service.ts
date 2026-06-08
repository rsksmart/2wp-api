import * as precompiledAbis from '@rsksmart/rsk-precompiled-abis';
import {getLogger, Logger} from '../utils/logger';
import {ethers} from 'ethers';
import BridgeTransactionParser, {Transaction} from '@rsksmart/bridge-transaction-parser';
import { getBridgeState, BridgeState } from '@rsksmart/bridge-state-data-parser';
import * as constants from '../constants';

export class BridgeService {
  private bridgeContract: ethers.Contract;
  private provider: ethers.JsonRpcProvider;
  private TOTAL_RBTC_STOCK = BigInt(21000000);
  private host: string;
  private bridgeTransactionParser: BridgeTransactionParser;
  logger: Logger;
  constructor() {
    this.provider = new ethers.JsonRpcProvider(`${process.env.RSK_NODE_HOST}`);
    this.bridgeContract = new ethers.Contract(precompiledAbis.bridge.address, precompiledAbis.bridge.abi, this.provider);
    this.host = process.env.RSK_NODE_HOST ?? constants.TESTNET_RSK_NODE_HOST;
    this.bridgeTransactionParser = new BridgeTransactionParser(this.provider);
    this.logger = getLogger('bridge-service');
  }

  public getBridgeContract(): ethers.Contract {
    return this.bridgeContract;
  }

  public getFederationAddress(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.bridgeContract
        .getFederationAddress()
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
      this.bridgeContract
        .getMinimumLockTxValue()
        .then((minValue: string) => resolve(Number(minValue)))
        .catch((reason: any) => {
          this.logger.warn(`[getMinPeginValue] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }

  public getLockingCapAmount(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.bridgeContract
        .getLockingCap()
        .then((lockingCap: string) => resolve(Number(lockingCap)))
        .catch((reason: any) => {
          this.logger.warn(`[getLockingCapAmount] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }

  public getRbtcInCirculation(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.provider
        .getBalance(precompiledAbis.bridge.address)
        .then((balance: bigint) => {
          const amount = this.TOTAL_RBTC_STOCK - balance;
          resolve(Number(amount));
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
      this.bridgeContract
        .isBtcTxHashAlreadyProcessed(txHash)
        .then((isProcessed: Boolean) => resolve(isProcessed))
        .catch((reason: any) => {
          this.logger.warn(`[isBtcTxHashAlreadyProcessed] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }

  public async getBridgeTransactionByHash(txHash: string): Promise<Transaction | undefined> {
    return await this.bridgeTransactionParser.getBridgeTransactionByTxHash(txHash);
  }

  public async getBridgeState(defaultBlock: string | number = 'latest'): Promise<BridgeState> {
    return await getBridgeState(this.host, defaultBlock);
  }

}
