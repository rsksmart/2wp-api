import {expect, sinon} from '@loopback/testlab';
import { BridgeEvent } from '@rsksmart/bridge-transaction-parser';
import {RskBlock} from '../../../models/rsk/rsk-block.model';
import {RskNodeService} from '../../../services/rsk-node.service';
import { BRIDGE_EVENTS } from '../../../utils/bridge-utils';

process.env.RSK_NODE_HOST = 'https://public-node.testnet.rsk.co';

const getInitialBlock = () => new RskBlock(2863627, '0xba5e', '0x');

const mockWeb3Tx = {
    hash: '0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66',
    blockHash: '0xba5e000000000000000000000000000000000000000000000000000000000000',
    blockNumber: BigInt(2863627),
    input: '0x',
    to: '0x0000000000000000000000000000000001000006',
    value: BigInt(0),
    from: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
};

const mockReceipt = {
    blockNumber: BigInt(2863627),
    blockHash: '0xba5e000000000000000000000000000000000000000000000000000000000000',
    transactionHash: '0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66',
};

const mockBridgeTx = {
    txHash: '0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66',
    blockNumber: 2863627,
    blockTimestamp: 1626736729000,
    sender: '0x4495768E683423a4299D6a7f02A0689a6ff5a0A4',
    events: [] as BridgeEvent[],
    method: {name: '', signature: '', arguments: {}},
};

describe('Service: RskNodeService', () => {
    let thisService: RskNodeService;

    beforeEach(() => {
        thisService = new RskNodeService();
        sinon.stub(thisService.web3.eth, 'getBlock').resolves({number: BigInt(2863627), hash: '0xba5e'} as any);
        sinon.stub(thisService.web3.eth, 'getTransactionReceipt').resolves(mockReceipt as any);
        sinon.stub(thisService.web3.eth, 'getTransaction').resolves(mockWeb3Tx as any);
        sinon.stub(thisService.web3.eth, 'getBlockNumber').resolves(BigInt(2863627));
        sinon.stub(thisService.bridgeTransactionParser, 'getBridgeTransactionByTxHash').resolves(mockBridgeTx as any);
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Searches the block using initial block conf', async () => {
        const block = await thisService.getBlock(getInitialBlock().height);
        sinon.assert.match(Number(block.number), getInitialBlock().height);
    });
    it('Searches the Tx receipt', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const txReceipt = await thisService.getTransactionReceipt(simpleTransaction);
        sinon.assert.match(Number(txReceipt.blockNumber), getInitialBlock().height);
    });
    it('Searches the RSKTx with receipt and validate block number', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const txRsk = await thisService.getTransaction(simpleTransaction, true);
        sinon.assert.match(Number(txRsk.receipt!.blockNumber), getInitialBlock().height);
    });
    it('Searches the RSKTx with receipt', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const txRsk = await thisService.getTransaction(simpleTransaction, true);
        expect(txRsk.receipt).to.not.be.null;
    });
    it('Searches the RSKTx without receipt', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const txRsk = await thisService.getTransaction(simpleTransaction, false);
        expect(txRsk.receipt).to.be.null;
    });
    it('Searches the block', async () => {
        const block = await thisService.getBlock(getInitialBlock().height);
        expect(block).to.not.be.null;
    });
    it('Searches the block number', async () => {
        const block = await thisService.getBlockNumber();
        expect(block).to.not.be.null;
    });
    it('Searches the Bridge Transaction', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const txRsk = await thisService.getBridgeTransaction(simpleTransaction);
        expect(txRsk.events).to.be.null;
    });
    it('Searches the Bridge Transaction RELEASE_REQUEST_RECEIVED', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const txRsk = await thisService.getBridgeTransaction(simpleTransaction);
        const releaseRequestRejectedEvent: BridgeEvent = txRsk.events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED)!;

        expect(releaseRequestRejectedEvent).to.be.null;
    });
});
