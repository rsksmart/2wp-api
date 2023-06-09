import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {UtxoController} from '../../controllers/utxo.controller';
import {AddressList, Utxo} from '../../models';
import {UtxoResponse} from '../../models/utxo-response.model';
import {UtxoProvider} from '../../services';

describe('utxo controller', () => {
  let utxoProviderService: UtxoProvider;
  let utxoProvider: sinon.SinonStub;
  let utxoController: UtxoController;
  const addressList = new AddressList({
    addressList: [
      'tb1qtrrtrjcmkf08yhzrytqtg6x94uwlvqwl9h0000',
      'tb1qtrrtrjcmkf08yhzrytqtg6x94uwlvqwl9h1111',
    ],
  });
  function resetRepositories() {
    utxoProviderService = {utxoProvider: sinon.stub()};
    utxoProvider = utxoProviderService.utxoProvider as sinon.SinonStub;
    utxoController = new UtxoController(utxoProviderService);
  }
  beforeEach(resetRepositories);
  it('returns utxos from an address list', async () => {
    const {addressList: addresses} = addressList;
    const [address1, address2] = addresses;
    const utxoList = [
      {
        txid: '',
        vout: 0,
        amount: '0.000001',
        satoshis: 100,
        height: 0,
        confirmations: 0,
      },
      {
        txid: '',
        vout: 1,
        amount: '0.000002',
        satoshis: 200,
        height: 0,
        confirmations: 0,
      },
      {
        txid: '',
        vout: 2,
        amount: '0.000003',
        satoshis: 300,
        height: 0,
        confirmations: 0,
      },
    ];
    const [utxo1, utxo2, utxo3] = utxoList;
    utxoProvider.withArgs(address1).resolves([utxo1, utxo2]);
    utxoProvider.withArgs(address2).resolves([utxo3]);
    const utxoResponse = await utxoController.getUtxos(addressList);
    sinon.assert.callCount(utxoProvider, 2);
    expect(utxoResponse).deepEqual(
      new UtxoResponse({
        data: [
          new Utxo({
            address: address1,
            ...utxo1,
          }),
          new Utxo({
            address: address1,
            ...utxo2,
          }),
          new Utxo({
            address: address2,
            ...utxo3,
          }),
        ],
      }),
    );
  });
});
