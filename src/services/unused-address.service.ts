import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {BitcoinService} from '.';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BitcoinAddress} from '../models/bitcoin-address.model';
import SatoshiBig from '../utils/SatoshiBig';


export class UnusedAddressService {
  private logger: Logger;
  private bitcoinService: BitcoinService;

  constructor(
    @inject(ServicesBindings.BITCOIN_SERVICE)
    bitcoinService: BitcoinService,
  ) {
    this.bitcoinService = bitcoinService;
    this.logger = getLogger('unused-address');
  }

  public isUnusedAddresses(addresses: string[]): Promise<boolean> {
    this.logger.debug("[isUnusedAddresses] starting to analyse addresses");
    return new Promise<boolean>(async (resolve, reject) => {
      try {
        let isUnused: boolean = true;
        for (let index = 0; index < addresses.length && isUnused; index += 1) {
          this.logger.trace(`[isUnusedAddresses] Analysing ${addresses[index]}`);
          let addressReturned: BitcoinAddress = await this.bitcoinService.getAddressInfo(addresses[index]);
          const totalReceived: SatoshiBig = new SatoshiBig(addressReturned.totalReceived, 'satoshi');
          const totalSent: SatoshiBig = new SatoshiBig(addressReturned.totalSent, 'satoshi');
          isUnused = totalReceived.eq(0) && totalSent.eq(0);
          this.logger.trace(`[isUnusedAddresses] ${addresses[index]} is ${isUnused ? 'unused' : 'used'}`);
        }
        resolve(isUnused === true);
      } catch (e: unknown) {
        this.logger.debug(`[isUnusedAddresses] Failed. ${e}`);
        reject(e);
      }
    });
  }
}
