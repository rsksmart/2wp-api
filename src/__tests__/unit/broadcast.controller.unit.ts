import {expect} from '@loopback/testlab';

import {BroadcastController} from '../../controllers';
import {TxStatus} from '../../services';
import {BroadcastRequest} from '../../models';

describe('broadcast controller', () => {
  it('should return tx status', async () => {
    const txSerialized =
      '0100000001186f9f998a5aa6f048e51dd8419a14d8a0f1a8a2836dd73 4d2804fe65fa35779000000008b483045022100884d142d86652a3f47 ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039 ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e3813 01410484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade84 16ab9fe423cc5412336376789d172787ec3457eee41c04f4938de5cc1 7b4a10fa336a8d752adfffffffff0260e31600000000001976a914ab6 8025513c3dbd2f7b92a94e0581f5d50f654e788acd0ef800000000000 1976a9147f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a888ac 00000000';
    const txId =
      '26b41ffb107a28ecb7f671145aaa43662b5315c1f078f4ba0c004af45a5b082f';

    const txStatus: TxStatus = {
      result: txId,
    };

    const dummyBroadcastController = new BroadcastController({
      broadcast: function (hexTx: string): Promise<TxStatus[]> {
        return Promise.resolve([txStatus]);
      },
    });

    const txSent = await dummyBroadcastController.sendTx(
      new BroadcastRequest({
        data: txSerialized,
      }),
    );

    expect(txSent.txId).to.eql(txId);
  });

  it('should return an error if there are no tx status returned', async () => {
    const txSerialized = 'encoded hex tx';

    const txStatusError: TxStatus = {
      error: {message: 'random error message'},
    };

    const dummyBroadcastController = new BroadcastController({
      broadcast: function (hexTx: string): Promise<TxStatus[]> {
        return Promise.resolve([txStatusError]);
      },
    });

    const txSent = await dummyBroadcastController.sendTx(
      new BroadcastRequest({
        data: txSerialized,
      }),
    );

    expect(txSent.error).to.eql({message: 'random error message'});
  });
});
