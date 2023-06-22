import base58 from 'bs58';
import {getLogger, Logger} from 'log4js';
import {remove0x} from './hex-utils';
import {doubleSha256} from './sha256-utils';
import * as constants from '../constants';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import peginAddressVerifier from 'pegin-address-verificator';
import * as bitcoin from 'bitcoinjs-lib';
import WeiBig from './WeiBig';
import SatoshiBig from './SatoshiBig';

export const calculateBtcTxHash = (transaction: string) => {
  const hash = doubleSha256(remove0x(transaction));
  const bufferedHash = Buffer.from(hash, 'hex');
  bufferedHash.reverse();
  return bufferedHash.toString('hex');
};

export const calculateBtcTxHashSegWitAndNonSegwit = (raw: string) => {
  const tx:string = bitcoin.Transaction.fromHex(raw).getId();
  return tx;
};

export const fromWeiNumberToSatoshiNumber = (weis: number) => {
  const satoshis = Number((new SatoshiBig((new WeiBig(weis, 'wei')).toRBTCString(), 'btc')).toSatoshiString());
  return satoshis;    
}

export type AddressType = 'BITCOIN_LEGACY_ADDRESS' | 'BITCOIN_SEGWIT_ADDRESS' | 'BITCOIN_NATIVE_SEGWIT_ADDRESS' | 'BITCOIN_MULTISIGNATURE_ADDRESS';

export class BtcAddressUtils {
  public logger: Logger;

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

  public getBtcAddressFromHash(hash160: string): string {
    let hash = remove0x(hash160);
    try{
      // Since Fingerroot the "release_request_received" event changed and now the btcDestinationAddress is a proper Base58 address
      // Check if the length of the data is different than 40, then it should be an address, otherwise treat it as a hash160
      if (hash.length != 40) {
        return hash;
      }
      const OP_DUP = '76';
      const OP_HASH160 = 'a9';
      const BYTES_TO_PUSH = '14';
      const OP_EQUALVERIFY = '88';
      const OP_CHECKSIG = 'ac';
      const script = OP_DUP + OP_HASH160 + BYTES_TO_PUSH + hash + OP_EQUALVERIFY + OP_CHECKSIG;
      const bufferFrom = Buffer.from(script, 'hex');
      let btcNetwork = bitcoin.networks.testnet;
      const network = process.env.NETWORK ?? constants.NETWORK_TESTNET;

      if(network === constants.NETWORK_MAINNET){
        btcNetwork = bitcoin.networks.bitcoin;
      }

      const address = (bitcoin.address.fromOutputScript(bufferFrom, btcNetwork));
      return address;
    } catch (e) {
      this.logger.warn("Error getBtcAddressFromHash ", e.message);
      return hash;
    }
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

  public validateAddress(address: string): {valid: boolean; addressType: AddressType} {
    const network = process.env.NETWORK ?? constants.NETWORK_TESTNET;
    const addressInfo = peginAddressVerifier.getAddressInformation(address);
    let addressType: AddressType = constants.BITCOIN_MULTISIGNATURE_ADDRESS;
    const valid = addressInfo ? addressInfo.network === network : false;
    if (valid) {
      switch (addressInfo.type) {
        case 'p2pkh':
          addressType = constants.BITCOIN_LEGACY_ADDRESS;
          break;
        case 'p2sh':
          addressType = constants.BITCOIN_SEGWIT_ADDRESS;
          break;
        case 'bech32':
          addressType = constants.BITCOIN_NATIVE_SEGWIT_ADDRESS;
          break;
        default:
          addressType = constants.BITCOIN_MULTISIGNATURE_ADDRESS;
      }
    }
    return { valid, addressType};
  }
}
