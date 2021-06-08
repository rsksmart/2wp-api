import {get, getModelSchemaRef} from '@loopback/rest';
import {PeginStatus} from '../models';
import {PeginStatusService} from '../services';

export class PeginStatusController {
  constructor(
    protected peginStatusService: PeginStatusService = new PeginStatusService(),
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

