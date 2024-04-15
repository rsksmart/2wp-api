import {Logger, getLogger} from 'log4js';
import {inject} from '@loopback/core';
import {Response, RestBindings, getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {repository} from '@loopback/repository';
import {ServicesBindings} from '../dependency-injection-bindings';
import {RegisterPayload} from '../models';
import {RegisterService, FlyoverService} from '../services';
import {SessionRepository} from '../repositories';
import * as constants from '../constants';

export class RegisterController {
  logger: Logger;

  constructor(
    @inject(ServicesBindings.REGISTER_SERVICE)
    protected registerService: RegisterService,    
    @inject(ServicesBindings.FLYOVER_SERVICE)
    protected flyoverService: FlyoverService,
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
    @requestBody({
      content: {'application/json': {schema: getModelSchemaRef(RegisterPayload)}},
    })
    payload: RegisterPayload,
  ): Promise<Response> {
    const {sessionId, type, provider} = payload;
    let session;
    if (sessionId) {
      session = await this.sessionRepository.get(sessionId);
    }
    if (session != null || type === constants.TX_TYPE_PEGOUT) {
      await this.registerService.register(payload);
    }
    if (provider) {
      await this.flyoverService.register(payload);
    }
    return this.response.status(200).send();
  }
}
