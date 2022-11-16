import { PegoutStatusDataModel } from '../../../../models/rsk/pegout-status-data-model';
import { PegoutStatusAppDataModel } from '../../../../models/rsk/pegout-status-data-model';
import { expect } from '@loopback/testlab';

describe('Model: PegoutStatusDataModel', () => {
    let model: PegoutStatusDataModel;

    beforeEach(() => {
        model = new PegoutStatusAppDataModel();
      })

    it('Verify if contains the new attributes', async () => {
        model.federationTotalSignaturesRequired = 5;
        model.federationSignatures = ['fed1', 'fed2', 'fed3', 'fed4', 'fed5'];
        expect(model.federationSignatures).not.null();
        expect(model.federationTotalSignaturesRequired).not.null();
        expect(model.federationSignatures.length).to.equal(model.federationTotalSignaturesRequired);
    });

});
