import * as precompiledAbis from '@rsksmart/rsk-precompiled-abis';
import { ethers } from 'ethers';
import { getBridgeState, BridgeState } from '@rsksmart/bridge-state-data-parser';
import { getLogger, Logger } from '../utils/logger';
import * as constants from '../constants';

export class BridgeService {
  private bridgeContract: ethers.Contract;
  private provider: ethers.JsonRpcProvider;
  private TOTAL_RBTC_STOCK = ethers.parseEther('21000000');
  private host: string;
  logger: Logger;
  constructor() {
    this.provider = new ethers.JsonRpcProvider(`${process.env.RSK_NODE_HOST}`);
    this.bridgeContract = new ethers.Contract(precompiledAbis.bridge.address, precompiledAbis.bridge.abi, this.provider);
    this.host = process.env.RSK_NODE_HOST ?? constants.TESTNET_RSK_NODE_HOST;
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
        .catch((err: any) => {
          this.logger.warn({ method: 'getFederationAddress', err }, 'Bridge call failed');
          reject(err);
        });
    });
  }

  public getMinPeginValue(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.bridgeContract
        .getMinimumLockTxValue()
        .then((minValue: string) => resolve(Number(minValue)))
        .catch((err: any) => {
          this.logger.warn({ method: 'getMinPeginValue', err }, 'Bridge call failed');
          reject(err);
        });
    });
  }

  public getLockingCapAmount(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.bridgeContract
        .getLockingCap()
        .then((lockingCap: string) => resolve(Number(lockingCap)))
        .catch((err: any) => {
          this.logger.warn({ method: 'getLockingCapAmount', err }, 'Bridge call failed');
          reject(err);
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
        .catch(err => {
          this.logger.warn({ method: 'getRbtcInCirculation', err }, 'Bridge call failed');
          reject(err);
        });
    });
  }

  /**
   * How much more BTC the bridge accepts before it reaches its locking cap: the
   * locking cap minus the RBTC in circulation, in satoshis, never below zero.
   *
   * This is the bridge's limit, not the limit on one peg-in, so it ignores
   * `MAX_AMOUNT_ALLOWED_IN_SATOSHI`; {@link getPeginAvailability} applies that.
   *
   * @returns The remaining peg-in capacity, in satoshis.
   */
  public getRemainingPeginCapacity(): Promise<number> {
    return Promise.all([this.getLockingCapAmount(), this.getRbtcInCirculation()])
      .then(([lockingCap, rbtcInCirculation]) => {
        const rbtcInCirculationSatoshis = Math.round(rbtcInCirculation / 1e10);
        const remaining = lockingCap - rbtcInCirculationSatoshis;
        return remaining > 0 ? remaining : 0;
      });
  }

  public getPeginAvailability(): Promise<number> {
    return this.getRemainingPeginCapacity()
      .then(remaining => {
        const maxAllowed = process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI
          ? Number(process.env.MAX_AMOUNT_ALLOWED_IN_SATOSHI) : Infinity;
        return Math.min(remaining, maxAllowed);
      })
      .catch(err => {
        this.logger.warn({ method: 'getPeginAvailability', err }, 'Bridge call failed');
        throw err;
      });
  }

  public async isBtcTxHashAlreadyProcessed(txHash: string): Promise<Boolean> {
    return new Promise<Boolean>((resolve, reject) => {
      this.bridgeContract
        .isBtcTxHashAlreadyProcessed(txHash)
        .then((isProcessed: Boolean) => resolve(isProcessed))
        .catch((err: any) => {
          this.logger.warn({ method: 'isBtcTxHashAlreadyProcessed', err }, 'Bridge call failed');
          reject(err);
        });
    });
  }

  public async getBridgeState(defaultBlock: string | number = 'latest'): Promise<BridgeState> {
    return await getBridgeState(this.host, defaultBlock);
  }

}
