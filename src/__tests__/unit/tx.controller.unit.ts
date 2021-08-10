import {sinon, expect} from '@loopback/testlab';

import {TxController} from '../../controllers';
import {Tx as ITx, TxService} from '../../services';
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

    const dummyTx: ITx = {
      txid: dummyTxId,
      version: 0,
      vin: [],
      vout: [],
      blockhash: 'blockhash',
      blockheight: 0,
      confirmations: 0,
      time: 0,
      blocktime: 0,
      valueOut: 'valueOut',
      valueIn: 'valueIn',
      fees: 'fees',
      hex: 'hex',
    };

    txProvider.withArgs(dummyTxId).resolves(dummyTx);
  }

  it('should return tx', async () => {
    // const dummyTxController = new TxController({
    //   txProvider: function (txId: string): Promise<ITx> {
    //     return Promise.resolve(dummyTx);
    //   }
    // });

    // console.log('dummyTxController', dummyTxController);
    // console.log('dummyTxController.getTx', dummyTxController.getTx);

    // const txSent: Tx = await txController.getTx(dummyTxId);
    // expect(txSent.txid).to.eql(dummyTxId);
  });
});
