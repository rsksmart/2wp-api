import {
  createStubInstance,
    expect, stubExpressContext,
  } from '@loopback/testlab';
import { FeaturesController } from '../../controllers/features.controller';
import { FeaturesDataService } from '../../services';
import { FeaturesDbDataModel } from '../../models/features-data.model';
import { FeaturesMongoDbDataService } from '../../services/features-mongo.service';
import { BackofficeFeatureFlagsService } from '../../services/backoffice-feature-flags.service';

  describe('FeaturesController (unit)', () => {
    let mockedService: FeaturesDataService;
    let mockedBackofficeService: BackofficeFeatureFlagsService;
    let context = stubExpressContext();
    let getAll: sinon.SinonStub;
    let getProviderFlags: sinon.SinonStub;

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
      mockedBackofficeService = createStubInstance(BackofficeFeatureFlagsService);
      getProviderFlags = mockedBackofficeService.getProviderFlags as sinon.SinonStub;
      getProviderFlags.resolves(null);
      context = stubExpressContext();
    });


    describe('get()',() => {
        it('retrieves the features flags Information', async() => {
            const controller = new FeaturesController(context.response, mockedService, mockedBackofficeService);
            await controller.get();
            let result = await context.result;
            expect(result.payload).not.null();
        });
        it('Supported Browsers are valid data', async() => {
          const controller = new FeaturesController(context.response, mockedService, mockedBackofficeService);
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
      it('includes the backoffice provider availability flags in the response', async() => {
        getProviderFlags.resolves({FLYOVER: true, UNION_BRIDGE: false, POWPEG: true});
        const controller = new FeaturesController(context.response, mockedService, mockedBackofficeService);
        await controller.get();
        let result = await context.result;
        const features = <Array<FeaturesDbDataModel>>JSON.parse(result.payload);
        const byName = new Map(features.map(feature => [feature.name, feature.value]));
        expect(byName.get('flyover')).to.equal('enabled');
        expect(byName.get('union_bridge')).to.equal('disabled');
        expect(byName.get('powpeg')).to.equal('enabled');
        expect(byName.get('feature1')).to.equal('enabled');
      });
      it('serves the local features unchanged when the backoffice is unavailable', async() => {
        getProviderFlags.resolves(null);
        const controller = new FeaturesController(context.response, mockedService, mockedBackofficeService);
        await controller.get();
        let result = await context.result;
        const features = <Array<FeaturesDbDataModel>>JSON.parse(result.payload);
        expect(features.length).to.equal(1);
        expect(features[0].name).to.equal('feature1');
      });
      it('overwrites a locally stored feature with the backoffice value', async() => {
        getAll.resolves([{name: 'flyover', value: 'enabled', version: 1}]);
        getProviderFlags.resolves({FLYOVER: false, UNION_BRIDGE: false, POWPEG: false});
        const controller = new FeaturesController(context.response, mockedService, mockedBackofficeService);
        await controller.get();
        let result = await context.result;
        const features = <Array<FeaturesDbDataModel>>JSON.parse(result.payload);
        const flyover = features.filter(feature => feature.name === 'flyover');
        expect(flyover.length).to.equal(1);
        expect(flyover[0].value).to.equal('disabled');
      });
    });

  });
