import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {BitcoinService} from '.';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BitcoinAddress} from '../models/bitcoin-address.model';
import SatoshiBig from '../utils/SatoshiBig';
import {AddressUsedStatus, UnusedAddressResponse} from '../models';


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

  public async isUnusedAddresses(addresses: string[]): Promise<UnusedAddressResponse> {
      this.logger.debug("[isUnusedAddresses] starting to analyse addresses");
      const response: UnusedAddressResponse =  new UnusedAddressResponse({ data: [] });
      let bitcoinAddress: BitcoinAddress;
      for (const address of addresses) {
        try {
          bitcoinAddress = await this.bitcoinService.getAddressInfo(address)
          const totalReceived: SatoshiBig = new SatoshiBig(bitcoinAddress.totalReceived, 'satoshi');
          const totalSent: SatoshiBig = new SatoshiBig(bitcoinAddress.totalSent, 'satoshi');
          const unused = totalReceived.eq(0) && totalSent.eq(0);
          response.data.push(new AddressUsedStatus({
            address: bitcoinAddress.address,
            unused,
          }));
          this.logger.trace(`[isUnusedAddresses] ${bitcoinAddress} is ${unused ? 'unused' : 'used'}`);
        } catch(e) {
          this.logger.debug(`[isUnusedAddresses] Error obtaining one address, keep trying to get everyone else. ${e}`);
        }
      }
      return response;
  }
}
