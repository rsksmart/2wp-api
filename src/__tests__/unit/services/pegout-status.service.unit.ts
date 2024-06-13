import {createStubInstance, expect, StubbedInstanceWithSinonAccessor} from '@loopback/testlab';
import sinon from 'sinon';
import {PegoutStatusService} from "../../../services";
import {PegoutStatusMongoDbDataService} from "../../../services/pegout-status-data-services/pegout-status-mongo.service";
import {
    PegoutStatuses,
    PegoutStatusAppDataModel,
} from "../../../models/rsk/pegout-status-data-model";
import { RskNodeService } from '../../../services/rsk-node.service';
import { RskTransaction } from '../../../models/rsk/rsk-transaction.model';
import { ExtendedBridgeTxModel } from '../../../services/extended-bridge-tx';
import { BridgeEvent, BridgeMethod, Transaction } from 'bridge-transaction-parser';
import { TransactionReceipt  } from 'web3-eth';
import { PegoutStatus } from '../../../models';

describe('Pegout Status Service:', () => {
    let pegoutStatusService: PegoutStatusService;
    let pegoutStatusServiceMocked: PegoutStatusService;
    let getLastByOriginatingRskTxHash: sinon.SinonStub;
    let rskNodeService: RskNodeService;
    let getTransaction: sinon.SinonStub;
    let getBridgeTransaction: sinon.SinonStub;
    let processTransaction: sinon.SinonStub;
    let pegoutStatusDataService: StubbedInstanceWithSinonAccessor<PegoutStatusMongoDbDataService>;

    const testBtcRawTx = "0200000001b2f339ac3c3726afaf42e92e0fe5af60b99241c8f3fcbe214d7e1198dd3a1f3301000000fd250100000000004d1d016453210208f40073a9e43b3e9103acec79767a6de9b0409749884e989960fee578012fce210225e892391625854128c5c4ea4340de0c2a70570f33db53426fc9c746597a03f421025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da210344a3c38cd59afcba3edcebe143e025574594b001700dec41e59409bdbd0f2a09556702cd50b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f5368aeffffffff0214db0600000000001976a91460890b78920fed16f7505dc1e8b66ea249da062288ac4b6d70000000000017a9148f38b3d8ec8816f7f58a390f306bb90bb178d6ac8700000000";


    beforeEach(() => {
        pegoutStatusDataService = createStubInstance(PegoutStatusMongoDbDataService);
        pegoutStatusServiceMocked = createStubInstance(PegoutStatusService);
        rskNodeService = createStubInstance(RskNodeService);
        pegoutStatusService = new PegoutStatusService(pegoutStatusDataService, rskNodeService);
        getTransaction = rskNodeService.getTransaction as sinon.SinonStub;
        getBridgeTransaction = rskNodeService.getBridgeTransaction as sinon.SinonStub;
        getLastByOriginatingRskTxHash = pegoutStatusDataService.getLastByOriginatingRskTxHashNewest as sinon.SinonStub;
        //@ts-ignore
        processTransaction = pegoutStatusServiceMocked.processTransaction as sinon.SinonStub;
    });
    afterEach(sinon.restore);

    it('should return a valid Pegout Status if there is no record on database', async () => {
        getLastByOriginatingRskTxHash
            .withArgs('RskTestTxId')
            .resolves(null);
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatus({
            status: PegoutStatuses.NOT_FOUND,
        });
        expect(pegoutStatus).to.be.deepEqual(expectedResponse);
    });
    it('should return a Pegout Status: RECEIVED', async () => {
        getLastByOriginatingRskTxHash
            .withArgs('RskTestTxId')
            .resolves({
                rskTxHash: 'RskTestTxId',
                rskSenderAddress: 'testSenderAddress',
                btcRecipientAddress: 'testBtcRecipientAddress',
                valueRequestedInSatoshis: 500000,
                valueInSatoshisToBeReceived: 495000,
                feeInSatoshisToBePaid: 5000,
                status: PegoutStatuses.RECEIVED,
                btcRawTransaction: testBtcRawTx,
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatus({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatuses.RECEIVED,
            btcTxId: '86264805cc07e98eb7744f1584ac1aa0d584e2d2830f7d3da353a118c6ae8544',
        });
        expect(pegoutStatus).to.be.deepEqual(expectedResponse);
    });
    it('should return a Pegout Status: PENDING when existing rskTransaction has no receipt', async () => {
        let rskTransactionWithoutReceipt: RskTransaction = {
            hash: 'txHash', 
            blockHash: 'blockHash', 
            blockHeight: 300000, 
            data: 'data', 
            createdOn: new Date(), 
            to: 'to', 
            receipt: null 
        };

        getLastByOriginatingRskTxHash
            .withArgs('txHash')
            .resolves(null);
        getTransaction
            .withArgs('txHash')
            .resolves(rskTransactionWithoutReceipt);
        
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('txHash');
        expect(pegoutStatus.status).to.be.deepEqual(PegoutStatuses.PENDING);
    });
    it('should return a Pegout Status: != PENDING when existing rskTransaction has receipt', async () => {
        const mockedTxReceipt = {} as TransactionReceipt;
        const rskTransactionWithReceipt: RskTransaction = { 
            hash: 'txHash', 
            blockHash: 'blockHash', 
            blockHeight: 300000, 
            data: 'data', 
            createdOn: new Date(), 
            to: 'to', 
            receipt: mockedTxReceipt
        };

        const bridgeEvent = [{}] as BridgeEvent[];
        const bridgeMethod = {} as BridgeMethod;

        const transaction: Transaction = { 
            txHash: '', 
            method: bridgeMethod, 
            events: bridgeEvent, 
            blockNumber: 0 
        }
        
        getLastByOriginatingRskTxHash
            .withArgs('rskTxHash')
            .resolves(null);
        
        getTransaction
            .withArgs('rskTxHash')
            .resolves(rskTransactionWithReceipt);
        
        getBridgeTransaction
            .withArgs('rskTxHash')
            .resolves(transaction)
        
        const extendedModel: ExtendedBridgeTxModel = new ExtendedBridgeTxModel(transaction, rskTransactionWithReceipt)
        
        const processedTransaction = new PegoutStatusAppDataModel({
            originatingRskTxHash: 'originatingRskTxHash',
            rskTxHash: 'rskTxHash',
            rskSenderAddress: 'senderAddress',
            btcRecipientAddress: 'btcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatuses.RECEIVED,
            btcRawTransaction: 'btcRawTx',
        });
        
        processTransaction
            .withArgs(extendedModel)
            .resolves(processedTransaction);

        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('rskTxHash');
        expect(pegoutStatus.status).to.not.be.deepEqual(PegoutStatuses.PENDING);
    });
    it('should return a Pegout Status: REJECTED', async () => {
        getLastByOriginatingRskTxHash
            .withArgs('RskTestTxId')
            .resolves({
                rskTxHash: 'RskTestTxId',
                rskSenderAddress: 'testSenderAddress',
                btcRecipientAddress: 'testBtcRecipientAddress',
                valueRequestedInSatoshis: 0,
                valueInSatoshisToBeReceived: 0,
                feeInSatoshisToBePaid: 0,
                status: PegoutStatuses.REJECTED,
                btcRawTransaction: 'testBtcRawTx',
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatus({
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            valueRequestedInSatoshis: 0,
            status: PegoutStatuses.REJECTED,
            originatingRskTxHash: 'RskTestTxId',
        });
        expect(pegoutStatus).to.be.deepEqual(expectedResponse);
    });
    it('should return a Pegout Status: WAITING_FOR_CONFIRMATION', async () => {
        getLastByOriginatingRskTxHash
            .withArgs('RskTestTxId')
            .resolves({
                rskTxHash: 'RskTestTxId',
                rskSenderAddress: 'testSenderAddress',
                btcRecipientAddress: 'testBtcRecipientAddress',
                valueRequestedInSatoshis: 500000,
                valueInSatoshisToBeReceived: 495000,
                feeInSatoshisToBePaid: 5000,
                status: PegoutStatuses.WAITING_FOR_CONFIRMATION,
                btcRawTransaction: testBtcRawTx,
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatus({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatuses.WAITING_FOR_CONFIRMATION,
            btcTxId: '86264805cc07e98eb7744f1584ac1aa0d584e2d2830f7d3da353a118c6ae8544',
        });
        expect(pegoutStatus).to.be.deepEqual(expectedResponse);
    });
    it('should return a Pegout Status: WAITING_FOR_SIGNATURE', async () => {
        getLastByOriginatingRskTxHash
            .withArgs('RskTestTxId')
            .resolves({
                rskTxHash: 'RskTestTxId',
                rskSenderAddress: 'testSenderAddress',
                btcRecipientAddress: 'testBtcRecipientAddress',
                valueRequestedInSatoshis: 500000,
                valueInSatoshisToBeReceived: 495000,
                feeInSatoshisToBePaid: 5000,
                status: PegoutStatuses.WAITING_FOR_SIGNATURE,
                btcRawTransaction: testBtcRawTx,
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatus({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatuses.WAITING_FOR_SIGNATURE,
            btcTxId: '86264805cc07e98eb7744f1584ac1aa0d584e2d2830f7d3da353a118c6ae8544',
        });
        expect(pegoutStatus).to.be.deepEqual(expectedResponse);
    });
    it('should return a Pegout Status: SIGNED', async () => {
        getLastByOriginatingRskTxHash
            .withArgs('RskTestTxId')
            .resolves({
                rskTxHash: 'RskTestTxId',
                rskSenderAddress: 'testSenderAddress',
                btcRecipientAddress: 'testBtcRecipientAddress',
                valueRequestedInSatoshis: 500000,
                valueInSatoshisToBeReceived: 495000,
                feeInSatoshisToBePaid: 5000,
                status: PegoutStatuses.SIGNED,
                btcRawTransaction: testBtcRawTx,
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatus({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatuses.SIGNED,
            btcTxId: '86264805cc07e98eb7744f1584ac1aa0d584e2d2830f7d3da353a118c6ae8544',
        });
        expect(pegoutStatus).to.be.deepEqual(expectedResponse);
    });
    it('should return an error if the database has an exception', async () => {
        getLastByOriginatingRskTxHash
            .withArgs('RskTestTxId')
            .rejects(new Error('Unexpected Database error'));
        return expect(pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId'))
            .to.be.rejectedWith(new Error('Unexpected Database error'));
    });
    it('verify sanitize method', async () => {
        const expectedResponse = new PegoutStatusAppDataModel({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: '123___123',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatuses.SIGNED,
            btcRawTransaction: testBtcRawTx,
        });

        const pegoutStatus = await pegoutStatusService.sanitizePegout(expectedResponse);
        return expect(pegoutStatus.rskTxHash)
            .to.be.equal('123');
    });

    it('verify sanitize method when there are not rawTx', async () => {
        const expectedResponse = new PegoutStatusAppDataModel({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: '123___123',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatuses.SIGNED,
            btcRawTransaction: undefined,
        });

        const pegoutStatus = await pegoutStatusService.sanitizePegout(expectedResponse);
        return expect(pegoutStatus.btcTxId).to.be.undefined();
    });

    it('verify sanitize method when rskTxHash has no _ ', async () => {
        const expectedResponse = new PegoutStatusAppDataModel({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: '123',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatuses.SIGNED,
            btcRawTransaction: testBtcRawTx,
        });

        const pegoutStatus = await pegoutStatusService.sanitizePegout(expectedResponse);
        return expect(pegoutStatus.rskTxHash)
            .to.be.equal('123');
    });
});
