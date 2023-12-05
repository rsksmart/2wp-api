import {
    expect, stubExpressContext,
  } from '@loopback/testlab';
import { FeaturesController } from '../../controllers/features.controller';
import { FeaturesDataService } from '../../services';

  describe('FeaturesController (unit)', () => {
    const mockedService = <FeaturesDataService>{};
    let context = stubExpressContext();


    describe('get()',() => {
        it('retrieves the features flags Information', async() => {
            const controller = new FeaturesController(context.response, mockedService);
            await controller.get();            
            let result = await context.result;
            expect(result.payload).not.null();
        });
    });

  });
  