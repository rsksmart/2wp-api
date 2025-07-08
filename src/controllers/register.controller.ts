import {Logger, getLogger} from 'log4js';
import {inject} from '@loopback/core';
import {Response, RestBindings, getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {repository} from '@loopback/repository';
import {ServicesBindings} from '../dependency-injection-bindings';
import {RegisterPayload} from '../models';
import {RegisterService, FlyoverService} from '../services';
import {SessionRepository} from '../repositories';
import { validateRegisterPayload } from '../utils/sanitization-utils';

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
    if(payload.type === 'pegout' && !payload.provider) {
      const error = validateRegisterPayload(payload);
      if (error) {
        return this.response.status(400).send({error});
      }
    }
    const {provider} = payload;
    if (provider) {
      await this.flyoverService.register(payload);
    }
    await this.registerService.register(payload);
    return this.response.status(200).send();
  }
}
