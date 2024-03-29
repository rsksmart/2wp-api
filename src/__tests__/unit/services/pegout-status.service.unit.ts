import {createStubInstance, expect, StubbedInstanceWithSinonAccessor} from '@loopback/testlab';
import sinon from 'sinon';
import {PegoutStatusService} from "../../../services";
import {PegoutStatusMongoDbDataService} from "../../../services/pegout-status-data-services/pegout-status-mongo.service";
import {
    PegoutStatus,
    PegoutStatusAppDataModel,
} from "../../../models/rsk/pegout-status-data-model";
import { RskNodeService } from '../../../services/rsk-node.service';
import { RskTransaction } from '../../../models/rsk/rsk-transaction.model';
import { ExtendedBridgeTxModel } from '../../../services/extended-bridge-tx';
import { BridgeEvent, BridgeMethod, Transaction } from 'bridge-transaction-parser';
import { TransactionReceipt  } from 'web3-eth';

describe('Pegout Status Service:', () => {
    let pegoutStatusService: PegoutStatusService;
    let pegoutStatusServiceMocked: PegoutStatusService;
    let getLastByOriginatingRskTxHash: sinon.SinonStub;
    let rskNodeService: RskNodeService;
    let getTransaction: sinon.SinonStub;
    let getBridgeTransaction: sinon.SinonStub;
    let processTransaction: sinon.SinonStub;
    let pegoutStatusDataService: StubbedInstanceWithSinonAccessor<PegoutStatusMongoDbDataService>;
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
    it('should return a valid Pegout Status if there is no record on database', async () => {
        getLastByOriginatingRskTxHash
            .withArgs('RskTestTxId')
            .resolves(null);
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatusAppDataModel({
            status: PegoutStatus.NOT_FOUND,
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
                status: PegoutStatus.RECEIVED,
                btcRawTransaction: 'testBtcRawTx',
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatusAppDataModel({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatus.RECEIVED,
            btcRawTransaction: 'testBtcRawTx',
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
        expect(pegoutStatus.status).to.be.deepEqual(PegoutStatus.PENDING);
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
            status: PegoutStatus.RECEIVED,
            btcRawTransaction: 'btcRawTx',
        });
        
        processTransaction
            .withArgs(extendedModel)
            .resolves(processedTransaction);

        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('rskTxHash');
        expect(pegoutStatus.status).to.not.be.deepEqual(PegoutStatus.PENDING);
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
                status: PegoutStatus.REJECTED,
                btcRawTransaction: 'testBtcRawTx',
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatusAppDataModel({
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            valueRequestedInSatoshis: 0,
            status: PegoutStatus.REJECTED,
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
                status: PegoutStatus.WAITING_FOR_CONFIRMATION,
                btcRawTransaction: 'testBtcRawTx',
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatusAppDataModel({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatus.WAITING_FOR_CONFIRMATION,
            btcRawTransaction: 'testBtcRawTx',
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
                status: PegoutStatus.WAITING_FOR_SIGNATURE,
                btcRawTransaction: 'testBtcRawTx',
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatusAppDataModel({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatus.WAITING_FOR_SIGNATURE,
            btcRawTransaction: 'testBtcRawTx',
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
                status: PegoutStatus.SIGNED,
                btcRawTransaction: 'testBtcRawTx',
                originatingRskTxHash: 'RskTestTxId',
                rskBlockHeight: 3158962,
                lastUpdatedOn: Date.now(),
            });
        const pegoutStatus = await pegoutStatusService.getPegoutStatusByRskTxHash('RskTestTxId');
        const expectedResponse = new PegoutStatusAppDataModel({
            originatingRskTxHash: 'RskTestTxId',
            rskTxHash: 'RskTestTxId',
            rskSenderAddress: 'testSenderAddress',
            btcRecipientAddress: 'testBtcRecipientAddress',
            valueRequestedInSatoshis: 500000,
            valueInSatoshisToBeReceived: 495000,
            feeInSatoshisToBePaid: 5000,
            status: PegoutStatus.SIGNED,
            btcRawTransaction: 'testBtcRawTx',
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
            status: PegoutStatus.SIGNED,
            btcRawTransaction: 'testBtcRawTx',
        });

        const pegoutStatus = await pegoutStatusService.sanitizePegout(expectedResponse);
        return expect(pegoutStatus.rskTxHash)
            .to.be.equal('123');
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
            status: PegoutStatus.SIGNED,
            btcRawTransaction: 'testBtcRawTx',
        });

        const pegoutStatus = await pegoutStatusService.sanitizePegout(expectedResponse);
        return expect(pegoutStatus.rskTxHash)
            .to.be.equal('123');
    });
});
