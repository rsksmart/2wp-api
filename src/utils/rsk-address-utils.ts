import {getLogger, Logger} from 'log4js';
import {keccak256} from 'web3-utils';

export class RskAddressUtils {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('RskAddressUtils');
  }

  private parseData(data: string): string {
    if ((data.substr(0, 2) == '48') && (data.substr(146, 2) == ' 21')) {
      return data.substr(148, data.length - 148)
    } else {
      return "";
    }
  }

  public getRskAddressFromOpReturn(data: string): string {
    return Buffer.from(`${data}`, 'hex').toString('hex');
  }

  public getRskAddressFromPubKeyHash(data: string): string {
    const pubKey = this.parseData(data);
    const pubKeyHash = this.getKeccak256Omit12(pubKey.substr(1, pubKey.length));
    return pubKeyHash;
  }

  private getKeccak256Omit12(pubKey: string): string {
    const hash = keccak256(pubKey);
    return hash.substr(12, hash.length);
  }
}
