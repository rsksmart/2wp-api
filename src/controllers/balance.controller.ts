import {inject} from '@loopback/core';
import {repository} from '@loopback/repository';
import {getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {
  AccountBalance,
  AddressBalance,
  GetBalance,
  Utxo
} from '../models';
import {SessionRepository} from '../repositories';
import {UtxoProvider} from '../services';

export class BalanceController {
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
      const eventualUtxos = getBalance.addressList.map(walletAddress =>
        Promise.all([
          walletAddress.address,
          this.utxoProviderService.utxoProvider(walletAddress.address),
        ]),
      );
      Promise.all(eventualUtxos)
        .then(addressUtxos =>
          addressUtxos.map(
            ([address, utxoList]) =>
              new AddressBalance({
                address,
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
}
