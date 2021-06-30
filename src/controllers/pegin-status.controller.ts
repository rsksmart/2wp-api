import {inject} from '@loopback/core';
import {get, getModelSchemaRef} from '@loopback/rest';
import {PeginStatus} from '../models';
import {BitcoinService, PeginStatusService, TxV2Service} from '../services';

export class PeginStatusController {
  constructor(
    @inject('services.TxV2Service')
    protected txV2Service: TxV2Service,
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
    return this.peginStatusService.getPeginSatusInfo(txId);
  }
}

