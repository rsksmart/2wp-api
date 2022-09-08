import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import {
  AccountBalance,
  AddressBalance,
  GetBalance,
  Utxo, WalletAddress
} from '../models';
import {SessionRepository} from '../repositories';
import {BitcoinService} from '../services';
import {BtcAddressUtils} from '../utils/btc-utils';

export class BalanceController {
  btcAddressUtils: BtcAddressUtils = new BtcAddressUtils();
  logger: Logger;
  constructor(
    @inject('services.BitcoinService')
    protected bitcoinService: BitcoinService,
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
  ) {
    this.logger = getLogger('balance-controller');
  }

  @post('/balance', {
    responses: {
      '200': {
        description: 'an address balance',
        content: {
          'application/json': {
            schema: getModelSchemaRef(AccountBalance, {includeRelations: true}),
          },
        },
      },
    },
  })
  async getBalance(
    @requestBody({schema: getModelSchemaRef(GetBalance)})
    getBalance: GetBalance,
  ): Promise<AccountBalance> {
    this.logger.debug(`[getBalance] Started with getBalance ${getBalance}`);
    return new Promise<AccountBalance>((resolve, reject) => {
      const {areAllValid, classifiedList} = this.checkAndClassifyAddressList(getBalance.addressList);
      if (!areAllValid) reject(new Error('Invalid address list provided, please check'));
      const eventualUtxos = classifiedList.map((walletAddress) =>
        Promise.all([
          walletAddress,
          this.bitcoinService.getUTXOs(walletAddress.address),
        ]),
      );
      Promise.all(eventualUtxos)
        .then((addressUtxos) =>
          addressUtxos.map(
            ([walletAddress, utxoList]) =>
              new AddressBalance({
                address: walletAddress.address,
                addressType: walletAddress.addressType,
                utxoList: utxoList,
              }),
          ),
        )
        .then(addressBalances => {
          return Promise.all([
            this.sessionRepository.addUxos(getBalance.sessionId, addressBalances),
            addressBalances,
          ]);
        })
        .then(([result, addressBalances]) => {
          const accBalance = new AccountBalance({
            segwit: 0,
            nativeSegwit: 0,
            legacy: 0,
          });
          accBalance.calculateWalletBalance(addressBalances);
          this.logger.trace(`[getBalance] accBalance ${accBalance}`);
          resolve(accBalance);
        })
        .catch(reason => {
          this.logger.warn(`[getBalance] Something went wrong. error: `, reason);
          reject(reason);
        });
    });
  }

  private checkAndClassifyAddressList(addressList: WalletAddress[])
    :{ areAllValid: boolean; classifiedList: WalletAddress[]} {
    let areAllValid = true;
    const classifiedList = addressList;
    for (const walletAddress of addressList) {
      const { valid, addressType } = this.btcAddressUtils.validateAddress(walletAddress.address);
      areAllValid = areAllValid && valid;
      if (valid) walletAddress.addressType = addressType;
    }
    return {areAllValid, classifiedList};
  }
}
