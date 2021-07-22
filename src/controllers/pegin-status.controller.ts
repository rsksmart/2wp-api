import {inject} from '@loopback/core';
import {get, getModelSchemaRef} from '@loopback/rest';
import {PeginStatus} from '../models';
import {PeginStatusService, TxV2Service} from '../services';
import {BitcoinService} from '../services/pegin-status/bitcoin.service';

export class PeginStatusController {
  constructor(
    @inject('services.TxV2Service')
    protected txV2Service: TxV2Service, //TODO: Verify if needed to inject or not. Take in account that we are doing an hybrid here.
    protected bitcoinService: BitcoinService = new BitcoinService(txV2Service),
    protected peginStatusService: PeginStatusService = new PeginStatusService(bitcoinService),
  ) { }

  @get('/pegin-status', {
    parameters: [{name: 'txId', schema: {type: 'string'}, in: 'query'}],
    responses: {
      '200': {
        description: 'return informartion for Pegin Status',
        content: {
          'application/json': {
            schema: getModelSchemaRef(PeginStatus, {includeRelations: true}),
          },
        },
      },
    },
  })
  getTx(txId: string): Promise<PeginStatus> {
    //FIXME: filter request incorrect and return our errors and not loopback error
    return this.peginStatusService.getPeginSatusInfo(txId);
  }
}

