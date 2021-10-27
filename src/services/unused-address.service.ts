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
    return new Promise<boolean>(async (resolve, reject) => {
      let isUnused: boolean = true;
      for (let index = 0; index < addresses.length && isUnused; index += 1) {
        this.logger.debug(`Asking use for address ${addresses[index]}`);
        let addressReturned: BitcoinAddress = await this.bitcoinService.getAddressInfo(addresses[index]);
        const totalReceived: SatoshiBig = new SatoshiBig(addressReturned.totalReceived, 'satoshi');
        const totalSent: SatoshiBig = new SatoshiBig(addressReturned.totalSent, 'satoshi');
        isUnused = totalReceived.eq(0) && totalSent.eq(0);
      }
      resolve(isUnused === true);
    });
  }
}
