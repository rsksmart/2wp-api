import {get, getModelSchemaRef} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import {ApiInformation} from '../models';
import { HealthInformation } from '../models/health-information.model';

const packageJson = require('../../package.json');

export class HealthCheckController {
  logger: Logger;

  constructor() {
    this.logger = getLogger('health-check-controller');
  }

  @get('/health', {
    responses: {
      '200': {
        description: 'API information',
        content: {
          'application/json': {
            schema: getModelSchemaRef(HealthInformation),
          },
        },
      },
    },
  })
  health():HealthInformation {
    const version = packageJson.version;
    this.logger.debug(`[healthCheckController] current version : ${version}`);
    const health = new HealthInformation();
    return health;
  }
}
