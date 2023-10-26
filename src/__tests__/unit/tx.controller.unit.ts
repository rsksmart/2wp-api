import { sinon } from "@loopback/testlab";
import { TxController } from "../../controllers";

describe('tx controller', () => {
    it('should return a tx', async () => {
      const txId = 'txId';
      const tx = {
        txId,
        blockId: 'blockId',
        blockNum: 1,
        blockTime: 'blockTime',
        actionCount: 1,
        createdAt: 'createdAt',
        updatedAt: 'updatedAt',
      };
      const txService = {
        txProvider: sinon.stub().resolves([tx]),
      };
      const txController = new TxController(txService);
      const result = await txController.getTx(txId);
      sinon.assert.match(result, tx);
    });
    it('should reject if no tx is found', async () => {
      const txId = 'txId';
      const txService = {
        txProvider: sinon.stub().resolves([]),
      };
      const txController = new TxController(txService);
      await txController.getTx(txId).catch((err) => {
        sinon.assert.match(err.message, `No transaction found with txId: ${txId}`);
      });
    });
});