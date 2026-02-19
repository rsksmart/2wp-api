import {expect, sinon} from '@loopback/testlab';
import { BridgeEvent } from '@rsksmart/bridge-transaction-parser';
import {RskBlock} from '../../../models/rsk/rsk-block.model';
import {RskNodeService} from '../../../services/rsk-node.service';
import { BRIDGE_EVENTS } from '../../../utils/bridge-utils';

const getInitialBlock = () => new RskBlock(2863627, '0xba5e', '0x');

describe('Service: RskNodeService', () => {
    let rskNodeService: RskNodeService;
    let web3EthStub: any;

    beforeEach(() => {
        rskNodeService = new RskNodeService();
        web3EthStub = rskNodeService.web3.eth;
    });

    afterEach(() => {
        sinon.restore();
    });

    it('Searches the block using initial block conf', async () => {
        const mockBlock = {
            number: getInitialBlock().height,
            hash: getInitialBlock().hash,
            parentHash: getInitialBlock().parentHash
        };
        sinon.stub(web3EthStub, 'getBlock').resolves(mockBlock);

        const block = await rskNodeService.getBlock(getInitialBlock().height);
        sinon.assert.match(block.number, getInitialBlock().height);
    });

    it('Searches the Tx receipt', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const mockReceipt = {
            blockNumber: getInitialBlock().height,
            transactionHash: simpleTransaction
        };
        sinon.stub(web3EthStub, 'getTransactionReceipt').resolves(mockReceipt);

        const txReceipt = await rskNodeService.getTransactionReceipt(simpleTransaction);
        sinon.assert.match(txReceipt.blockNumber, getInitialBlock().height);
    });

    it('Searches the RSKTx with receipt and validate block number', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const mockTx = {
            hash: simpleTransaction,
            blockHash: '0xba5e',
            blockNumber: BigInt(getInitialBlock().height),
            input: '0x',
            to: '0x0000000000000000000000000000000001000006',
            value: BigInt(0),
            from: '0x1234567890123456789012345678901234567890'
        };
        const mockReceipt = {
            blockNumber: getInitialBlock().height,
            transactionHash: simpleTransaction
        };
        
        sinon.stub(web3EthStub, 'getTransaction').resolves(mockTx);
        sinon.stub(web3EthStub, 'getTransactionReceipt').resolves(mockReceipt);

        const txRsk = await rskNodeService.getTransaction(simpleTransaction, true);
        sinon.assert.match(txRsk.receipt!.blockNumber, getInitialBlock().height);
    });

    it('Searches the RSKTx with receipt', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const mockTx = {
            hash: simpleTransaction,
            blockHash: '0xba5e',
            blockNumber: BigInt(getInitialBlock().height),
            input: '0x',
            to: '0x0000000000000000000000000001000006',
            value: BigInt(0),
            from: '0x1234567890123456789012345678901234567890'
        };
        const mockReceipt = {
            blockNumber: getInitialBlock().height,
            transactionHash: simpleTransaction
        };
        
        sinon.stub(web3EthStub, 'getTransaction').resolves(mockTx);
        sinon.stub(web3EthStub, 'getTransactionReceipt').resolves(mockReceipt);

        const txRsk = await rskNodeService.getTransaction(simpleTransaction, true);
        expect(txRsk.receipt).to.not.be.null;
    });

    it('Searches the RSKTx without receipt', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const mockTx = {
            hash: simpleTransaction,
            blockHash: '0xba5e',
            blockNumber: BigInt(getInitialBlock().height),
            input: '0x',
            to: '0x0000000000000000000000000001000006',
            value: BigInt(0),
            from: '0x1234567890123456789012345678901234567890'
        };
        
        sinon.stub(web3EthStub, 'getTransaction').resolves(mockTx);

        const txRsk = await rskNodeService.getTransaction(simpleTransaction, false);
        expect(txRsk.receipt).to.be.null;
    });

    it('Searches the block', async () => {
        const mockBlock = {
            number: getInitialBlock().height,
            hash: getInitialBlock().hash,
            parentHash: getInitialBlock().parentHash
        };
        sinon.stub(web3EthStub, 'getBlock').resolves(mockBlock);

        const block = await rskNodeService.getBlock(getInitialBlock().height);
        expect(block).to.not.be.null;
    });

    it('Searches the block number', async () => {
        const mockBlockNumber = BigInt(3000000);
        sinon.stub(web3EthStub, 'getBlockNumber').resolves(mockBlockNumber);

        const block = await rskNodeService.getBlockNumber();
        expect(block).to.not.be.null;
    });

    it('Searches the Bridge Transaction', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const mockBridgeTx = {
            txHash: simpleTransaction,
            blockNumber: getInitialBlock().height,
            events: null,
            method: null,
            sender: '0x1234567890123456789012345678901234567890',
            blockTimestamp: 1234567890
        };
        
        sinon.stub(rskNodeService.bridgeTransactionParser, 'getBridgeTransactionByTxHash').resolves(mockBridgeTx as any);

        const txRsk = await rskNodeService.getBridgeTransaction(simpleTransaction);
        expect(txRsk.events).to.be.null;
    });

    it('Searches the Bridge Transaction RELEASE_REQUEST_RECEIVED', async () => {
        const simpleTransaction = "0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66";
        const mockBridgeTx = {
            txHash: simpleTransaction,
            blockNumber: getInitialBlock().height,
            events: [],
            method: null,
            sender: '0x1234567890123456789012345678901234567890',
            blockTimestamp: 1234567890
        };
        
        sinon.stub(rskNodeService.bridgeTransactionParser, 'getBridgeTransactionByTxHash').resolves(mockBridgeTx as any);

        const txRsk = await rskNodeService.getBridgeTransaction(simpleTransaction);
        const releaseRequestRejectedEvent: BridgeEvent = txRsk.events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED)!;

        expect(releaseRequestRejectedEvent).to.be.undefined;
    });
});
