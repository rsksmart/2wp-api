import { inject } from '@loopback/core';
import { RestBindings, get, getModelSchemaRef, Response, } from '@loopback/rest';
import { getLogger, Logger } from '../utils/logger';
import { ServicesBindings } from '../dependency-injection-bindings';
import { FeaturesDataService } from '../services/features-data.service';
import { BackofficeFeatureFlagsService, MergedFeature, applyProviderFlags } from '../services/backoffice-feature-flags.service';
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
    @inject(ServicesBindings.BACKOFFICE_FEATURE_FLAGS_SERVICE)
    private backofficeFeatureFlagsService: BackofficeFeatureFlagsService,
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
  /**
   * `GET /features` — returns the stored feature-flag documents.
   *
   * Writes the JSON body and status directly onto the injected `Response`
   * (200 with the feature list on success, 500 with a placeholder single-item
   * array if `FeaturesDataService.getAll()` throws) rather than returning a value.
   *
   * @returns The `Response` object, already sent.
   */
  public async get(): Promise<Response> {
    this.logger.debug({method: 'get'}, 'started');
    let features: MergedFeature[] = [new FeaturesDbDataModel()];
    let responseCode = this.HTTP_ERROR;
    try {
        features = await this.featuresDatService.getAll();
        responseCode = this.HTTP_SUCCESS_OK;
        const backofficeFlags = await this.backofficeFeatureFlagsService.getProviderFlags();
        if (backofficeFlags) {
            features = applyProviderFlags(features, backofficeFlags);
        }
        this.logger.info({method: 'get', featureCount: features.length}, 'Retrieved the features');
    } catch (err) {
        this.logger.warn({method: 'get', err}, 'Failed to retrieve features');
    }
    this.response.contentType('application/json').status(responseCode).send(
        features
    );
    return this.response;
  }
}
