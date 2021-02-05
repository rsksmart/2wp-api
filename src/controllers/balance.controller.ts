// Uncomment these imports to begin using these cool features!

import {inject} from '@loopback/core';
import {UtxoProvider} from '../services';
import {post, getModelSchemaRef, requestBody} from '@loopback/rest';
import {AccountBalance, WalletAddress} from '../models';


export class BalanceController {
  constructor(
    @inject('services.UtxoProvider') protected utxoProviderService: UtxoProvider,
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
    @requestBody.array(
      {schema: getModelSchemaRef(WalletAddress, {includeRelations: true})},
     {description: 'an array of walletAddresses', required: true}
    ) walletAddresses: WalletAddress[],
  ): Promise<AccountBalance> {
    const res = await this.utxoProviderService.utxoProvider('mqCjBpQ75Y5sSGzFtJtSQQZqhJze9eaKjV')
    console.log(res);
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      resolve( new WalletAddress({
        segwit: 0,
        native: 0,
        legacy: 0,
      }))
    });
  }
}
