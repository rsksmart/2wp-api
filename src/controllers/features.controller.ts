import { inject } from '@loopback/core';
import { getLogger, Logger } from 'log4js';
import { RestBindings, get, getModelSchemaRef, Response, } from '@loopback/rest';
import { ServicesBindings } from '../dependency-injection-bindings';
import { FeaturesDataService } from '../services/features-data.service';
import { FeaturesDbDataModel } from '../models/features-data.model';
import { TermsDataService } from '../services/terms-data.service';

export class FeaturesController {
  logger: Logger;
  private featuresDatService: FeaturesDataService;
  private termsDatService: TermsDataService;
  HTTP_SUCCESS_OK = 200;
  HTTP_ERROR = 500;
  constructor(
    @inject(RestBindings.Http.RESPONSE) private response: Response,
    @inject(ServicesBindings.FEATURES_SERVICE)
    featuresDatService: FeaturesDataService,
    @inject(ServicesBindings.TERMS_SERVICE)
    termsDatService: TermsDataService,
  ) {
    this.featuresDatService = featuresDatService;
    this.termsDatService = termsDatService;
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
    let features = [new FeaturesDbDataModel()];
    let responseCode = this.HTTP_ERROR;
    try {
        features = await this.featuresDatService.getAll();
        const termsIdx = features.findIndex((feature) => feature.name === 'terms_and_conditions');
        this.logger.info(`[get] Retrieved terms idx: ${termsIdx}`);
        const terms = await this.termsDatService.getVersion(features[termsIdx].version);
        features[termsIdx].value = terms.value;
        responseCode = this.HTTP_SUCCESS_OK;
        this.logger.info(`[get] Retrieved the features: ${JSON.stringify(features)}`);
    } catch (e) {
        this.logger.warn(`[get] Got an error: ${e}`); 
    }
    this.response.contentType('application/json').status(responseCode).send(
        features
    );
    return this.response;
  }
}
