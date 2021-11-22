import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {
  AccountBalance,
  AddressBalance,
  GetBalance,
  Utxo, WalletAddress,
} from '../models';
import {SessionRepository} from '../repositories';
import {UtxoProvider} from '../services';
import {BtcAddressUtils} from '../utils/btc-utils';

export class BalanceController {
  btcAddressUtils: BtcAddressUtils = new BtcAddressUtils();
  constructor(
    @inject('services.UtxoProvider')
    protected utxoProviderService: UtxoProvider,
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
  ) { }

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
    return new Promise<AccountBalance>((resolve, reject) => {
      const {areAllValid, classifiedList} = this.checkAndClassifyAddressList(getBalance.addressList);
      if (!areAllValid) reject(new Error('Invalid address list provided, please check'));
      const eventualUtxos = classifiedList.map((walletAddress) =>
        Promise.all([
          walletAddress,
          this.utxoProviderService.utxoProvider(walletAddress.address),
        ]),
      );
      Promise.all(eventualUtxos)
        .then((addressUtxos) =>
          addressUtxos.map(
            ([walletAddress, utxoList]) =>
              new AddressBalance({
                address: walletAddress.address,
                addressType: walletAddress.addressType,
                utxoList: utxoList.map(uxto => new Utxo(uxto)),
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
          resolve(accBalance);
        })
        .catch(reject);
    });
  }

  private checkAndClassifyAddressList(addressList: WalletAddress[])
    :{ areAllValid: boolean; classifiedList: WalletAddress[]} {
    let areAllValid = true;
    const classifiedList = addressList;
    addressList.forEach((walletAddress) => {
      const { valid, addressType } = this.btcAddressUtils.validateAddress(walletAddress.address);
      areAllValid = areAllValid && valid;
      if (valid) walletAddress.addressType = addressType;
    });
    return {areAllValid, classifiedList};
  }
}
