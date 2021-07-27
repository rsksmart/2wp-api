import base58 from 'bs58';
import {sha256} from 'js-sha256';
import {getLogger, Logger} from 'log4js';
import {remove0x} from './hex-utils';

export const calculateBtcTxHash = (transaction: string) => {
  let buffer = Buffer.from(remove0x(transaction), 'hex');
  let hash = sha256(buffer);
  buffer = Buffer.from(hash, 'hex');
  hash = sha256(buffer);
  let bufferedHash = Buffer.from(hash, 'hex');
  bufferedHash.reverse();
  return bufferedHash.toString('hex');
};

export class BtcAddressUtils {
  private logger: Logger;

  constructor() {
    this.logger = getLogger('BtcAddressUtils');
  }

  public getRefundAddress(addressRefundInfo: string): string {
    let addressRefundData;
    let addressRefundType;
    let address = "";
    try {
      addressRefundType = Number(addressRefundInfo.substring(0, 2));
      addressRefundData = addressRefundInfo.substring(2, 42);

      if (addressRefundType == 1) { //P2PKH_ADDRESS_TYPE
        address = this.getAddress(addressRefundData, 'P2PKH');
      } else if (addressRefundType == 2) { //P2SH_ADDRESS_TYPE
        address = this.getAddress(addressRefundData, 'P2SH');
      } else {
        const errorMessage = `Wrong refund address type. Current type: ${addressRefundType}`;
        throw new Error(errorMessage);
      }
    }
    catch (error) {
      this.logger.warn("Error parsing refund address", error.message);
    }
    return address;
  }

  private getNetPrefix(netName: string, type: string) {
    if (netName == 'mainnet') {
      if (type == 'P2PKH') {
        return '00';
      } else if (type == 'P2SH') {
        return '05';
      }
    } else if (netName == 'testnet') {
      if (type == 'P2PKH') {
        return '6F';
      } else if (type == 'P2SH') {
        return 'C4';
      }
    }
    return '';
  }

  private getAddress(data: string, typeAddress: string): string { //TODO: To test with Ed's data
    if (data.length != 40) {
      this.logger.warn("Wrong size for script getting BTC refund address");
      return '';
    }

    try {
      const network = process.env.NETWORK ?? 'tesnet';
      const prefix = this.getNetPrefix(network, typeAddress);

      data = `${prefix}${data}`;
      let checksum = sha256(sha256(data)).slice(0, 8);
      return base58.encode(Buffer.from(`${data}${checksum}`, 'hex'))
    }
    catch (error) {
      this.logger.warn("Error getting BTC refund address");
    }
    return '';
  }
}
