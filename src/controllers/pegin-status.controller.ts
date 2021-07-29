import {inject} from '@loopback/core';
import {get, getModelSchemaRef} from '@loopback/rest';
import {PeginStatus} from '../models';
import {PeginStatusService} from '../services';

export class PeginStatusController {
  constructor(
    @inject('services.PeginStatusService')
    protected peginStatusService: PeginStatusService
  ) {
  }

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
  getTx(txId: string): Promise<PeginStatus> | null {
    //FIXME: filter request incorrect and return our errors and not loopback error
    try {
      return this.peginStatusService.getPeginSatusInfo(txId);
    } catch (exception) {
      return null
    };
  }
}

