import {
    expect,
    createStubInstance,
  } from '@loopback/testlab';
import { ApiInformationController } from '../../controllers/api-information.controller';
import type { Response } from 'express';

 

    describe('getApiInfo()',() => {
        it('retrieves the API Information', async() => {
            const controller = new ApiInformationController();
            const apiInfo    = controller.getApiInformation();
            const version = process.env.npm_package_version;
            
            expect(apiInfo).to.containEql({version: version});
        });
    });

 