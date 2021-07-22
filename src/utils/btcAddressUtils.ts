import base58 from 'bs58';
import {getLogger, Logger} from 'log4js';
const sha256 = require('js-sha256');

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
        this.logger.error(errorMessage);  //TODO: Verify if we need to throw error or use change address
        throw new Error(errorMessage);
      }
    }
    catch (error) {
      this.logger.warn("Error parsing refund address"); //TODO: Verify if we need to throw error or use change address
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
      this.logger.warn("Wrong size for scirpt getting P2SH refund address");
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
      this.logger.warn("Error getting P2PKH refund address");
    }
    return '';
  }
}
