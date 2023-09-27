import {expect, sinon} from '@loopback/testlab';
import { BridgeEvent } from 'bridge-transaction-parser';
import {RskBlock} from '../../../models/rsk/rsk-block.model';
import {RskNodeService} from '../../../services/rsk-node.service';
import { BRIDGE_EVENTS } from '../../../utils/bridge-utils';

const getInitialBlock = () => new RskBlock(2863627, '0xba5e', '0x');

describe('Service: RskNodeService', () => {
    it('Searches the block using initial block conf', async () => {
        const thisService = new RskNodeService();
        const block = await thisService.getBlock(getInitialBlock().height);
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
        const block = await thisService.getBlock(getInitialBlock().height);
        expect(block).to.not.be.null;
    });
    it('Searches the block number', async () => {
        const thisService = new RskNodeService();
        const block = await thisService.getBlockNumber();
        expect(block).to.not.be.null;
    });
    it('Searches the Bridge Transaction', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const thisService = new RskNodeService();
        const txRsk = await thisService.getBridgeTransaction(simpleTransaction);
        expect(txRsk.events).to.be.null;
    });
    it('Searches the Bridge Transaction RELEASE_REQUEST_RECEIVED', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const thisService = new RskNodeService();
        const txRsk = await thisService.getBridgeTransaction(simpleTransaction);
        const releaseRequestRejectedEvent: BridgeEvent = txRsk.events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED)!;

        expect(releaseRequestRejectedEvent).to.be.null;
    });
});
