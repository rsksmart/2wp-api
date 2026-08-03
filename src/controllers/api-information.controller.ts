import {get, getModelSchemaRef} from '@loopback/rest';
import {getLogger, Logger} from '../utils/logger';
import {ApiInformation} from '../models';

const packageJson = require('../../package.json');

export class ApiInformationController {
  logger: Logger;

  constructor() {
    this.logger = getLogger('api-information-controller');
  }

  /**
   * `GET /api` — returns this running instance's API version, read from `package.json`.
   *
   * @returns API information containing the current `version`.
   */
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
    this.logger.debug({method: 'getApiInformation', version});
    const apiInfo = new ApiInformation();
    apiInfo.version = version;
    return apiInfo;
  }
}
