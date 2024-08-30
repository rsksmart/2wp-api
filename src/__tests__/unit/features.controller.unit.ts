import {
    expect, stubExpressContext,
  } from '@loopback/testlab';
import { FeaturesController } from '../../controllers/features.controller';
import { FeaturesDataService } from '../../services';
import { TermsDataService } from '../../services/terms-data.service';

  describe('FeaturesController (unit)', () => {
    const mockedService = <FeaturesDataService>{};
    const mockedTermsService = <TermsDataService>{};
    let context = stubExpressContext();


    describe('get()',() => {
        it('retrieves the features flags Information', async() => {
            const controller = new FeaturesController(context.response, mockedService, mockedTermsService);
            await controller.get();            
            let result = await context.result;
            expect(result.payload).not.null();
        });
    });

  });
  