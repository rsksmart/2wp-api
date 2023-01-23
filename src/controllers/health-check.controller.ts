import {get, getModelSchemaRef} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import {ApiInformation} from '../models';
import { HealthInformation } from '../models/health-information.model';
import { HealthInformationChecks } from '../models/health-information-checks.model';

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
    health.status = "UP";
    health.check = [];

    let dataBase: HealthInformationChecks = new HealthInformationChecks();
    dataBase.name = "dataBase";
    dataBase.status = "UP";
    dataBase.info = "LAST_BLOCK=123";

    let blockBook: HealthInformationChecks = new HealthInformationChecks();
    blockBook.name = "blockBook";
    blockBook.status = "UP";
    blockBook.info = "LAST_BLOCK=123";

    let daemon: HealthInformationChecks = new HealthInformationChecks();
    daemon.name = "daemon";
    daemon.status = "UP";

    let rskNode: HealthInformationChecks = new HealthInformationChecks();
    rskNode.name = "daemon";
    rskNode.status = "UP";

    health.check.push(dataBase);
    health.check.push(blockBook);
    health.check.push(daemon);
    health.check.push(rskNode);
    
    return health;
  }
}
