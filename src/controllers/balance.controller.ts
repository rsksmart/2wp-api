// Uncomment these imports to begin using these cool features!

import {inject} from '@loopback/core';
import {UtxoProvider} from '../services';
import {post, getModelSchemaRef, requestBody} from '@loopback/rest';
import {AccountBalance, AddressBalance, GetBalance, Session, Utxo, WalletAddress} from '../models';
import {repository} from '@loopback/repository';
import {SessionRepository} from '../repositories';


export class BalanceController {
  constructor(
    @inject('services.UtxoProvider') protected utxoProviderService: UtxoProvider,
    @repository(SessionRepository)
    public sessionRepository : SessionRepository,
  ) {}

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
    @requestBody(
      {schema: getModelSchemaRef(GetBalance)},
    ) getBalance: GetBalance,
  ): Promise<AccountBalance> {
    let segwitBalance = 0;
    let nativeBalance = 0;
    let legacyBalance = 0;
    return new Promise<AccountBalance>( (resolve, reject) => {
      const eventualUtxos = getBalance.addressList.map((walletAddress) => Promise
        .all([walletAddress.address, this
          .utxoProviderService.utxoProvider(walletAddress.address)]));
      Promise.all(eventualUtxos)
        .then((addressUtxos) => addressUtxos.map(([address, utxoList]) => {
            console.log(utxoList);
            return new AddressBalance({ address, utxoList: utxoList.map((uxto) => new Utxo(uxto))});
          }))
        .then((addressBalances) => {
          console.log(JSON.stringify(addressBalances));
          return Promise.all([this.sessionRepository
            .replaceById(getBalance.sessionId, new Session({
              balance: 0,
              addressList: addressBalances,
            })), addressBalances])
        })
        .then(([result, addressBalances]) => {
          console.log(result);
          console.log(addressBalances);
        })
        .catch(reject);

      segwitBalance = 0;
      nativeBalance = 0;
      legacyBalance = 0;
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      resolve( new WalletAddress({
        segwit: segwitBalance,
        native: nativeBalance,
        legacy: legacyBalance,
      }))
    });
  }
}
