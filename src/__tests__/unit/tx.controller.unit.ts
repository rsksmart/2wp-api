import {sinon, expect} from '@loopback/testlab';

import {TxController} from '../../controllers';
import {TxService} from '../../services';
import {Tx} from '../../models';

describe('tx controller', () => {
  const dummyTxId =
    '26b41ffb107a28ecb7f671145aaa43662b5315c1f078f4ba0c004af45a5b082f';

  let txController: TxController;
  let txService: TxService;
  let txProvider: sinon.SinonStub;

  beforeEach(resetService);

  function resetService() {
    txService = {txProvider: sinon.stub()};
    txProvider = txService.txProvider as sinon.SinonStub;
    txController = new TxController(txService);
    const dummyTx = [
      dummyTxId,
      0,
      [],
      [],
      'blockhash',
      0,
      0,
      0,
      0,
      'valueOut',
      'valueIn',
      'fees',
      'hex',
    ];
    txProvider.withArgs(dummyTxId).resolves(dummyTx);
  }

  it('should return tx', async () => {
    const txSent: Tx = await txController.getTx(dummyTxId);
    expect(txSent.txid).to.eql(dummyTxId);
  });
});
