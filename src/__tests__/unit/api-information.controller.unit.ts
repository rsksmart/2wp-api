import {
    expect,
  } from '@loopback/testlab';
import { ApiInformationController } from '../../controllers/api-information.controller';

const packageJson = require('../../../package.json');

  describe('ApiInformationController (unit)', () => {

    describe('getApiInfo()',() => {
        it('retrieves the API Information', async() => {
            const controller = new ApiInformationController();
            const apiInfo    = controller.getApiInformation();
            const version = packageJson.version;
            
            expect(apiInfo).to.containEql({version: version});
        });
    });

  });