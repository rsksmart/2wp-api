import {Logger, getLogger} from 'log4js';
import {ServicesBindings} from '../dependency-injection-bindings';
import {inject} from '@loopback/core';
import {Response, RestBindings, getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {RegisterPayload} from '../models';
import {RegisterService} from '../services';

export class RegisterController {
  logger: Logger;

  constructor(
    @inject(ServicesBindings.REGISTER_SERVICE)
    protected registerService: RegisterService,
    @inject(RestBindings.Http.RESPONSE)
    private response: Response,
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
    return this.registerService
      .register(payload)
      .then(() => this.response.status(200).send())
      .catch(() => this.response.status(500).send());
  }
}
