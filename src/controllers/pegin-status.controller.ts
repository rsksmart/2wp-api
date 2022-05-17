import {inject} from '@loopback/core';
import {get, getModelSchemaRef} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {PeginStatus} from '../models';
import {PeginStatusError} from '../models/pegin-status-error.model';
import {PeginStatusService} from '../services';

export class PeginStatusController {
  private logger: Logger;

  constructor(
    @inject(ServicesBindings.PEGIN_STATUS_SERVICE)
    protected peginStatusService: PeginStatusService
  ) {
    this.logger = getLogger('peginStatusController');
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
  async getTx(txId: string): Promise<PeginStatus> {
    //FIXME: filter request incorrect and return our errors and not loopback error
    try {
      this.logger.debug(`[getTx] Started with txId ${txId}`);
      let result = await this.peginStatusService.getPeginSatusInfo(txId);
      this.logger.debug(`[getTx] Found tx with status ${result.status}`);
      return result;
    } catch (e) {
      this.logger.warn(`[getTx] Unexpected error: [${e}]`);
      return Promise.resolve(new PeginStatusError(txId));
    };
  }
}

