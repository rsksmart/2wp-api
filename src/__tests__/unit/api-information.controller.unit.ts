import {
    expect,
  } from '@loopback/testlab';
import { ApiInformationController } from '../../controllers/api-information.controller';

  describe('ApiInformationController (unit)', () => {

    describe('getApiInfo()',() => {
        it('retrieves the API Information', async() => {
            const controller = new ApiInformationController();
            const apiInfo    = controller.getApiInformation();
            
            expect(apiInfo).to.containEql({version: '1.0.1'});
        });
    });

  });