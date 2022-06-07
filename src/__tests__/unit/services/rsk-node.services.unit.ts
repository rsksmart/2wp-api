import {expect, sinon} from '@loopback/testlab';
import {RskBlock} from '../../../models/rsk/rsk-block.model';
import {RskNodeService} from '../../../services/rsk-node.service';

const getInitialBlock = () => new RskBlock(2863627, '0xba5e', '0x');

describe('Service: RskNodeService', () => {
    it('Searches the block using initial block conf', async () => {
        const thisService = new RskNodeService();
        const block = await thisService.getBlock(getInitialBlock().height, false);
        sinon.assert.match(block.number, getInitialBlock().height);
    });
    it('Verify ${process.env.RSK_NODE_HOST} configuration', async () => {
        const nodeHost = process.env.RSK_NODE_HOST;
        sinon.assert.match(nodeHost, 'https://public-node.testnet.rsk.co');
    });
    it('Searches the Tx receipt', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const thisService = new RskNodeService();
        const txReceipt = await thisService.getTransactionReceipt(simpleTransaction);
        sinon.assert.match(txReceipt.blockNumber, getInitialBlock().height);
    });
    it('Searches the RSKTx with receipt and validate block number', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const thisService = new RskNodeService();
        const txRsk = await thisService.getTransaction(simpleTransaction, true);
        sinon.assert.match(txRsk.receipt!.blockNumber, getInitialBlock().height);
    });
    it('Searches the RSKTx with receipt', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const thisService = new RskNodeService();
        const txRsk = await thisService.getTransaction(simpleTransaction, true);
        expect(txRsk.receipt).to.not.be.null;
    });
    it('Searches the RSKTx without receipt', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const thisService = new RskNodeService();
        const txRsk = await thisService.getTransaction(simpleTransaction, false);
        expect(txRsk.receipt).to.be.null;
    });
    it('Searches the block', async () => {
        const thisService = new RskNodeService();
        const block = await thisService.getBlock(getInitialBlock().height, false);
        expect(block).to.not.be.null;
    });
    it('Searches the block number', async () => {
        const thisService = new RskNodeService();
        const block = await thisService.getBlockNumber();
        expect(block).to.not.be.null;
    });
});
