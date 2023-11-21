import {Logger, getLogger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {inject} from '@loopback/core';
import {Response, RestBindings, getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {RegisterPayload} from '../models';
import {RegisterService} from '../services';
import {repository} from '@loopback/repository';
import {SessionRepository} from '../repositories';
import * as constants from '../constants';

export class RegisterController {
  logger: Logger;

  constructor(
    @inject(ServicesBindings.REGISTER_SERVICE)
    protected registerService: RegisterService,
    @inject(RestBindings.Http.RESPONSE)
    private response: Response,
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
  ) {
    this.logger = getLogger('register-controller');
  }

  @post('/register', {
    responses: {
      '200': {
        description:
          'Register a new transaction created by 2wp-app for metrics',
      },
    },
  })
  async register(
    @requestBody({schema: getModelSchemaRef(RegisterPayload)})
    payload: RegisterPayload,
  ): Promise<Response> {
    const {sessionId, type} = payload;
    let session;
    if (sessionId) {
      session = await this.sessionRepository.get(sessionId);
    }
    if (session != null || type === constants.TX_TYPE_PEGOUT) {
      await this.registerService.register(payload);
    }
    return this.response.status(200).send();
  }
}
