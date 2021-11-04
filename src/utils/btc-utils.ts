import base58 from 'bs58';
import {getLogger, Logger} from 'log4js';
import {remove0x} from './hex-utils';
import {doubleSha256} from './sha256-utils';

export const calculateBtcTxHash = (transaction: string) => {
  const hash = doubleSha256(remove0x(transaction));
  const bufferedHash = Buffer.from(hash, 'hex');
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

  private getAddress(data: string, typeAddress: string): string {
    if (data.length != 40) {
      this.logger.warn("Wrong size for script getting BTC refund address");
      return '';
    }

    try {
      const network = process.env.NETWORK ?? 'tesnet';
      const prefix = this.getNetPrefix(network, typeAddress);
      const dataToReview = `${prefix}${data}`;
      const checksum = doubleSha256(dataToReview).substr(0, 8);
      return base58.encode(Buffer.from(`${dataToReview}${checksum}`, 'hex'))
    }
    catch (error) {
      this.logger.warn("Error getting BTC refund address");
    }
    return '';
  }
}
