import { inject } from '@loopback/core';
import { getLogger, Logger } from 'log4js';
import { RestBindings, get, getModelSchemaRef, Response, } from '@loopback/rest';
import { ServicesBindings } from '../dependency-injection-bindings';
import { FeaturesDataService } from '../services/features-data.service';
import { FeaturesDbDataModel } from '../models/features-data.model';

export class FeaturesController {
  logger: Logger;
  private featuresDatService: FeaturesDataService;
  HTTP_SUCCESS_OK = 200;
  HTTP_ERROR = 500;
  constructor(
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @inject(ServicesBindings.FEATURES_SERVICE)
    featuresDatService: FeaturesDataService,
  ) {
    this.featuresDatService = featuresDatService;
    this.logger = getLogger('features-controller');
  }

  @get('/features', {
    responses: {
      '200': {
        description: 'Get the feature flags info',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: getModelSchemaRef(FeaturesDbDataModel, {
                includeRelations: true,
              }),
            },
          },
        },
      },
      '500': {
        description: 'Could not retrieve the features',
        content: {
          'application/json': {
            schema: {
              type: 'array',
              items: getModelSchemaRef(FeaturesDbDataModel, {
                includeRelations: true,
              }),
            },
          },
        },
      },
    },
  })
  public async get(): Promise<Response> {
    this.logger.debug('[get] started');
    let retorno = [new FeaturesDbDataModel()];
    let responseCode = this.HTTP_ERROR;
    try {
        retorno = await this.featuresDatService.getAll();
        responseCode = this.HTTP_SUCCESS_OK;
        this.logger.info(`[get] Retrieved the features: ${JSON.stringify(retorno)}`);
    } catch (e) {
        this.logger.warn(`[get] Got an error: ${e}`); 
    }
    this.response.contentType('application/json').status(responseCode).send(
        retorno
    );
    return this.response;
  }
}
