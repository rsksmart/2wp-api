import {getLogger, Logger} from 'log4js';
import {keccak256} from 'web3-utils';
import {Vin} from '../models/vin.model';

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

  public getRskAddressFromScriptSig(vin: Vin): string {
    //FIXME: Obtain witness and use it to get real velues.
    const pubKey = this.parseData(vin.hex);
    if (pubKey.length != 0) {
      return this.getKeccak256Omit12(pubKey.substr(1, pubKey.length));
    }
    return "";
  }

  private getKeccak256Omit12(pubKey: string): string {
    const hash = keccak256(pubKey);
    return hash.substr(12, hash.length);
  }
}
