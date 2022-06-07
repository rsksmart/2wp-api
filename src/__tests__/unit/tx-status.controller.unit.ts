import {TxStatusController} from "../../controllers";
import {PeginStatusService, PegoutStatusService} from "../../services";
import {createStubInstance, expect, StubbedInstanceWithSinonAccessor} from "@loopback/testlab";
import {BtcPeginStatus, PeginStatus, RskPeginStatus, Status, TxStatus, TxStatusType} from "../../models";
import {PeginStatus as RskPeginStatusEnum} from "../../models/rsk/pegin-status-data.model";
import {PegoutStatus, PegoutStatusAppDataModel} from "../../models/rsk/pegout-status-data-model";

describe('Controller: Tx Status', () => {
   let txStatusController: TxStatusController;
   let peginStatusService: StubbedInstanceWithSinonAccessor<PeginStatusService>;
   let pegoutStatusService: StubbedInstanceWithSinonAccessor<PegoutStatusService>;

   function resetController() {
      peginStatusService = createStubInstance(PeginStatusService);
      pegoutStatusService = createStubInstance(PegoutStatusService);
      txStatusController = new TxStatusController(peginStatusService, pegoutStatusService);
   }
   function getMockedPeginStatus(mockedTxId: string,status: Status): PeginStatus {
      const btcPeginStatus = new BtcPeginStatus(mockedTxId);
      btcPeginStatus.federationAddress = 'testFederationAddress';
      btcPeginStatus.requiredConfirmation = 100;
      btcPeginStatus.confirmations = 60;
      btcPeginStatus.refundAddress = 'testRefundAddress';
      btcPeginStatus.amountTransferred = 256893000
      btcPeginStatus.btcWTxId = mockedTxId;
      btcPeginStatus.creationDate = new Date(1653532992634);
      btcPeginStatus.fees = 5000;
      const peginStatus = new PeginStatus(btcPeginStatus);
      const rskPeginStatus = new RskPeginStatus();
      rskPeginStatus.confirmations = 50;
      rskPeginStatus.recipientAddress = 'testRskRecipientAddress';
      rskPeginStatus.createOn = new Date(1653532993634);
      rskPeginStatus.status = RskPeginStatusEnum.LOCKED;
      peginStatus.status = status;
      return peginStatus;
   }
   function getMockedPegoutStatus(rskTxId: string, status: PegoutStatus): PegoutStatusAppDataModel {
      const pegoutStatus = new PegoutStatusAppDataModel({
         originatingRskTxHash: rskTxId,
         valueRequestedInSatoshis: 200000,
         btcRawTransaction: 'testBtcRawTx',
         rskTxHash: rskTxId,
         btcRecipientAddress: 'testBtcRecipientAddress',
         feeInSatoshisToBePaid: 5000,
         valueInSatoshisToBeReceived: 195000,
         rskSenderAddress: 'testRskSenderAddress',
         status,
      });
      return pegoutStatus;
   }
   describe('PeginStatus', () => {
      beforeEach(resetController);

      it('should resolve a pegin txStatus: WAITING_CONFIRMATIONS', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId')
             .resolves(getMockedPeginStatus('testTxId', Status.WAITING_CONFIRMATIONS));
         const txStatus = await txStatusController.getTxStatus('testTxId');
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.WAITING_CONFIRMATIONS);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: NOT_IN_RSK_YET', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId')
             .resolves(getMockedPeginStatus('testTxId', Status.NOT_IN_RSK_YET));
         const txStatus = await txStatusController.getTxStatus('testTxId');
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.NOT_IN_RSK_YET);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: CONFIRMED', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId')
             .resolves(getMockedPeginStatus('testTxId', Status.CONFIRMED));
         const txStatus = await txStatusController.getTxStatus('testTxId');
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.CONFIRMED);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: REJECTED_NO_REFUND', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId')
             .resolves(getMockedPeginStatus('testTxId', Status.REJECTED_NO_REFUND));
         const txStatus = await txStatusController.getTxStatus('testTxId');
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.REJECTED_NO_REFUND);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: REJECTED_REFUND', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId')
             .resolves(getMockedPeginStatus('testTxId', Status.REJECTED_REFUND));
         const txStatus = await txStatusController.getTxStatus('testTxId');
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.REJECTED_REFUND);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: ERROR_BELOW_MIN', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId')
             .resolves(getMockedPeginStatus('testTxId', Status.ERROR_BELOW_MIN));
         const txStatus = await txStatusController.getTxStatus('testTxId');
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.ERROR_BELOW_MIN);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });

   });

   describe('Pegout Status:', () => {
      beforeEach(resetController);
      it('should ask for pegout status if there is no a pegin', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId')
             .resolves(getMockedPeginStatus('testTxId', Status.ERROR_NOT_A_PEGIN));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs('testTxId')
             .resolves(getMockedPegoutStatus('testTxId', PegoutStatus.RECEIVED));
         const status = await txStatusController.getTxStatus('testTxId');
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.PEGOUT);
      });
      it('should ask for pegout status if pegin status service has an ERROR_UNEXPECTED', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId2')
             .resolves(getMockedPeginStatus('testTxId2', Status.ERROR_UNEXPECTED));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs('testTxId2')
             .resolves(getMockedPegoutStatus('testTxId2', PegoutStatus.RECEIVED));
         const status = await txStatusController.getTxStatus('testTxId2');
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.PEGOUT);
      });
      it('should ask for pegout status if tx id are not in BTC yet', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId3')
             .resolves(getMockedPeginStatus('testTxId3', Status.NOT_IN_BTC_YET));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs('testTxId3')
             .resolves(getMockedPegoutStatus('testTxId3', PegoutStatus.RECEIVED));
         const status = await txStatusController.getTxStatus('testTxId3');
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.PEGOUT);
      });
      it('should resolve a valid pegout status', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId4')
             .resolves(getMockedPeginStatus('testTxId4', Status.NOT_IN_BTC_YET));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs('testTxId4')
             .resolves(getMockedPegoutStatus('testTxId4', PegoutStatus.RECEIVED));
         const status = await txStatusController.getTxStatus('testTxId4');
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status).to.be.deepEqual(new TxStatus({
            type: TxStatusType.PEGOUT,
            txDetails: new PegoutStatusAppDataModel({
               originatingRskTxHash: 'testTxId4',
               valueRequestedInSatoshis: 200000,
               btcRawTransaction: 'testBtcRawTx',
               rskTxHash: 'testTxId4',
               btcRecipientAddress: 'testBtcRecipientAddress',
               feeInSatoshisToBePaid: 5000,
               valueInSatoshisToBeReceived: 195000,
               rskSenderAddress: 'testRskSenderAddress',
               status: PegoutStatus.RECEIVED,
            }),
         }));
      });
      it('should resolve a txStatus: INVALID_DATA if it is not pegin status nor pegout status', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs('testTxId5')
             .resolves(getMockedPeginStatus('testTxId5', Status.NOT_IN_BTC_YET));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs('testTxId5')
             .resolves(getMockedPegoutStatus('testTxId5', PegoutStatus.NOT_FOUND));
         const status = await txStatusController.getTxStatus('testTxId5');
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.INVALID_DATA);
      });
   });
});
