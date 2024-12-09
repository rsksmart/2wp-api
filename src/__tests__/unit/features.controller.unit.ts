import {
  createStubInstance,
    expect, stubExpressContext,
  } from '@loopback/testlab';
import { FeaturesController } from '../../controllers/features.controller';
import { FeaturesDataService } from '../../services';
import { FeaturesAppDataModel, FeaturesDbDataModel } from '../../models/features-data.model';
import { create } from 'domain';
import { FeaturesMongoDbDataService } from '../../services/features-mongo.service';

  describe('FeaturesController (unit)', () => {
    let mockedService: FeaturesDataService;
    let context = stubExpressContext();
    let getAll: sinon.SinonStub;

    beforeEach(() => {
      mockedService = createStubInstance(FeaturesMongoDbDataService);
      getAll = mockedService.getAll as sinon.SinonStub;
      getAll.resolves([
        {
          name: 'feature1',
          value: 'enabled',
          version: 1,
          supportedBrowsers: {
            chrome: true,
            firefox: true,
            safari: false,
            edge: true,
            brave: false,
            chromium: true,
            opera: false,
          },
          creationDate: new Date(),
          lastUpdateDate: new Date(),
        },
      ]);
      context = stubExpressContext();
    });


    describe('get()',() => {
        it('retrieves the features flags Information', async() => {
            const controller = new FeaturesController(context.response, mockedService);
            await controller.get();            
            let result = await context.result;
            expect(result.payload).not.null();
        });
        it('Supported Browsers are valid data', async() => {
          const controller = new FeaturesController(context.response, mockedService);
          await controller.get();            
          let result = await context.result;
          const features = <Array<FeaturesDbDataModel>>JSON.parse(result.payload);
          features.forEach((element: FeaturesDbDataModel) => {
            expect(element.supportedBrowsers.chrome).to.be.Boolean();
            expect(element.supportedBrowsers.firefox).to.be.Boolean();
            expect(element.supportedBrowsers.safari).to.be.Boolean();
            expect(element.supportedBrowsers.edge).to.be.Boolean();
            expect(element.supportedBrowsers.brave).to.be.Boolean();
            expect(element.supportedBrowsers.chromium).to.be.Boolean();
            expect(element.supportedBrowsers.opera).to.be.Boolean();
          });
      });
    });

  });
  