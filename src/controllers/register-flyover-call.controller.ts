import {Logger, getLogger} from 'log4js';
import {inject} from '@loopback/core';
import {Response, RestBindings, getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {repository} from '@loopback/repository';
import {RegisterCallPayload} from '../models';
import {SessionRepository} from '../repositories';
import {ServicesBindings} from '../dependency-injection-bindings';
import {RegisterService} from '../services';

export class RegisterFlyoverCallController {
  logger: Logger;

  constructor(
    @inject(ServicesBindings.REGISTER_SERVICE)
    protected registerService: RegisterService,
    @inject(RestBindings.Http.RESPONSE)
    private response: Response,
    @repository(SessionRepository)
    public sessionRepository: SessionRepository,
  ) {
    this.logger = getLogger('register-flyover-call-controller');
  }

  @post('/register-flyover-call', {
    responses: {
      '200': {
        description:
          'Register a flyover call by 2wp-app for metrics',
      },
    },
  })
  async registerCalls(
    @requestBody({
      content: {'application/json': {schema: getModelSchemaRef(RegisterCallPayload)}},
    })
      payload: RegisterCallPayload,
  ): Promise<Response> {
    await this.registerService.registerFlyoverCall(payload);
    return this.response.status(200).send();
  }
}
