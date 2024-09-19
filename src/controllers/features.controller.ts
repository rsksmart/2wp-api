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
    return new Promise<Response>((resolve) => {
      this.logger.debug('[get] started');
      let features = [new FeaturesDbDataModel()];
      let responseCode = this.HTTP_ERROR;
      this.featuresDatService.getAll()
      .then((featuresFromDb) => {
        features = featuresFromDb;
        const termsIdx = featuresFromDb.findIndex((feature) => feature.name === 'terms_and_conditions');
        if (!termsIdx) {
          responseCode = this.HTTP_SUCCESS_OK;
          this.response.contentType('application/json').status(responseCode)
            .send(features);
          resolve(this.response);
        }
        this.logger.info(`[get] Retrieved terms idx: ${termsIdx}`);
        return Promise.all([this.termsDatService.getVersion(features[termsIdx].version), termsIdx]);
      })
      .then(([terms, termsIdx]) => {
        features[termsIdx].value = terms ? terms.value : 'Version not found';
        this.logger.info(`[get] Retrieved the features: ${JSON.stringify(features)}`);
        responseCode = this.HTTP_SUCCESS_OK;
        this.response.contentType('application/json').status(responseCode)
          .send(features);
        resolve(this.response);
      })
      .catch((error) => {
        this.logger.warn(`[get] Got an error: ${error}`);
        resolve(this.response);
      });
    });
  }
}
