import Web3 from 'web3';
import BridgeABI from '../abis/bridge.json';

export class BridgeService {
  private bridgeContract: object;
  private web3: Web3;
  private bridgeAddress: string;
  private TOTAL_RBTC_STOCK = 21000000;
  constructor(contractAddress: string) {
    this.web3 = new Web3(`${process.env.RSK_NODE_HOST}`);
    this.bridgeAddress = contractAddress;
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    this.bridgeContract = new this.web3.eth.Contract(
      BridgeABI,
      this.bridgeAddress,
    );
  }

  public getFederationAddress(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.bridgeContract.methods
        .getFederationAddress()
        .call()
        .then(resolve)
        .catch(reject);
    });
  }

  public getMinPeginValue(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      this.bridgeContract.methods
        .getMinimumLockTxValue()
        .call()
        .then((minValue: string) => resolve(Number(minValue)))
        .catch(reject);
    });
  }

  public getLockingCapAmount(): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
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
        .getBalance(this.bridgeAddress)
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
          const rbtcInCirculationToSatoshis = rbtcInCirculation / 1e10;
          const availability = lockingCap - rbtcInCirculationToSatoshis;
          resolve(availability > 0 ? Math.round(availability) : 0);
        })
        .catch(reject);
    });
  }
}
