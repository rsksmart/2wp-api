import {
  createStubInstance,
    expect, stubExpressContext,
  } from '@loopback/testlab';
import { FeaturesController } from '../../controllers/features.controller';
import { FeaturesDataService } from '../../services';
import { TermsDataService } from '../../services/terms-data.service';
import { StubbedInstanceWithSinonAccessor} from "@loopback/testlab";
import { FeaturesMongoDbDataService } from '../../services/features-mongo.service';
import { TermsMongoDbDataService } from '../../services/terms-mongo.service';

  describe('FeaturesController (unit)', () => {
    let mockedService: StubbedInstanceWithSinonAccessor<FeaturesDataService>;
    let mockedTermsService:StubbedInstanceWithSinonAccessor<TermsDataService>;
    let featuresGetAllStub: sinon.SinonStub;
    let context = stubExpressContext();
    mockedService = createStubInstance(FeaturesMongoDbDataService);
    mockedTermsService = createStubInstance(TermsMongoDbDataService);
    featuresGetAllStub = mockedService.getAll as sinon.SinonStub;

    describe('get()',() => {
        it('retrieves the features flags Information', async() => {
          featuresGetAllStub.resolves([{
            name: 'feature1', value: true,
            creationDate: new Date(),
            lastUpdateDate: new Date(),
            enabled: false,
            version: 0,
          }]);
          mockedTermsService.stubs.getVersion.resolves();
            const controller = new FeaturesController(context.response, mockedService, mockedTermsService);
            const response = await controller.get();
            expect(response.statusCode).to.equal(200);
        });
    });

  });
  