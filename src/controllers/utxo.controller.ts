import {inject} from '@loopback/core';
import {getModelSchemaRef, post, requestBody, response} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {AddressList, Utxo} from '../models';
import {UtxoResponse} from '../models/utxo-response.model';
import {UtxoProvider} from '../services';

export class UtxoController {
  logger: Logger;

  constructor(
    @inject(ServicesBindings.UTXO_PROVIDER_SERVICE)
    protected utxoProviderService: UtxoProvider,
  ) {
    this.logger = getLogger('utxo-controller');
  }

  @post('/utxo')
  @response(200, {
    description:
      'Returns array of unspent transaction outputs from a list of addresses',
    content: {'application/json': {schema: getModelSchemaRef(UtxoResponse)}},
  })
  async getUtxos(
    @requestBody({
      content: {'application/json': {schema: getModelSchemaRef(AddressList)}},
    })
    addressList: AddressList,
  ): Promise<UtxoResponse> {
    return new Promise<UtxoResponse>((resolve, reject) => {
      Promise.all(
        addressList.addressList.map(async address => {
          const utxos = await this.utxoProviderService.utxoProvider(address);
          return utxos.map(utxo => new Utxo({address, ...utxo}));
        }),
      )
        .then(utxosWithAddress => {
          this.logger.trace('[getUtxos] Got utxos!');
          resolve(new UtxoResponse({data: utxosWithAddress.flat()}));
        })
        .catch(reason => {
          this.logger.warn(`[getUtxos] Got an error: ${reason}`);
          reject(reason);
        });
    });
  }
}
