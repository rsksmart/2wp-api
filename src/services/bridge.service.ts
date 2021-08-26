import {bridge} from '@rsksmart/rsk-precompiled-abis';
import Web3 from 'web3';
import {Contract} from 'web3-eth-contract';

export class BridgeService {
  private bridgeContract: Contract;
  private web3: Web3;
  private TOTAL_RBTC_STOCK = 21000000;
  constructor() {
    this.web3 = new Web3(`${process.env.RSK_NODE_HOST}`);
    this.bridgeContract = bridge.build(this.web3)
  }

  public getFederationAddress(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const localTest = process.env.LOCAL_TEST ?? false;
      const localAddress: string = process.env.TEST_FEDERATION_ADDRESS ?? '';
      this.bridgeContract.methods
        .getFederationAddress()
        .call()
        .then((address: string) => {
          const fedAddress: string = localTest ? localAddress : address;
          resolve(fedAddress);
        })
        .catch(reject);
    });
  }

  public getMinPeginValue(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.bridgeContract.methods
        .getMinimumLockTxValue()
        .call()
        .then((minValue: string) => resolve(Number(minValue)))
        .catch(reject);
    });
  }

  public getLockingCapAmount(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      this.bridgeContract.methods
        .getLockingCap()
        .call()
        .then((lockingCap: string) => resolve(Number(lockingCap)))
        .catch(reject);
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
        .catch(reject);
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
        .catch(reject);
    });
  }
}
