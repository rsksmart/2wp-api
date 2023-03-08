import {createStubInstance, expect, StubbedInstanceWithSinonAccessor} from '@loopback/testlab';
import sinon from 'sinon';
import {PegoutStatusService} from "../../../services";
import {PegoutStatusMongoDbDataService} from "../../../services/pegout-status-data-services/pegout-status-mongo.service";
import {
    PegoutStatus,
    PegoutStatusAppDataModel,
} from "../../../models/rsk/pegout-status-data-model";
import { RskNodeService } from '../../../services/rsk-node.service';

describe('Pegout Status Service:', () => {
    let pegoutStatusService: PegoutStatusService;
    let getLastByOriginatingRskTxHash: sinon.SinonStub;
    let rskNodeService: RskNodeService;
    let pegoutStatusDataService: StubbedInstanceWithSinonAccessor<PegoutStatusMongoDbDataService>;
    beforeEach(() => {
        pegoutStatusDataService = createStubInstance(PegoutStatusMongoDbDataService);
        rskNodeService = createStubInstance(RskNodeService);
        getLastByOriginatingRskTxHash = pegoutStatusDataService.getLastByOriginatingRskTxHashNewest as sinon.SinonStub;

        pegoutStatusService = new PegoutStatusService(pegoutStatusDataService, rskNodeService);
        
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
            status: PegoutStatus.REJECTED,
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
});
