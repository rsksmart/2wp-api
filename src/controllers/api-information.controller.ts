/* eslint-disable @typescript-eslint/naming-convention */
import {get, getModelSchemaRef} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import {ApiInformation} from '../models';

const packageJson = require('../../package.json');

export class ApiInformationController {
  logger: Logger;

  constructor() {
    this.logger = getLogger('api-information-controller');
  }

  @get('/api', {
    responses: {
      '200': {
        description: 'API information',
        content: {
          'application/json': {
            schema: getModelSchemaRef(ApiInformation),
          },
        },
      },
    },
  })
  getApiInformation():ApiInformation {
    const version = packageJson.version;
    this.logger.debug(`[getApiInformation] current version : ${version}`);
    const apiInfo = new ApiInformation();
    apiInfo.version = version;
    return apiInfo;
  }
}
