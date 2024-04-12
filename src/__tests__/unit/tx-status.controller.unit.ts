import {TxStatusController} from "../../controllers";
import {PeginStatusService, PegoutStatusService, RegisterFlyoverService} from "../../services";
import {createStubInstance, expect, StubbedInstanceWithSinonAccessor} from "@loopback/testlab";
import {BtcPeginStatus, PeginStatus, RskPeginStatus, Status, TxStatus, TxStatusType} from "../../models";
import {PeginStatus as RskPeginStatusEnum} from "../../models/rsk/pegin-status-data.model";
import {PegoutStatus, PegoutStatusAppDataModel} from "../../models/rsk/pegout-status-data-model";

const testBtcTxHash = "280f0659920d59bc802f0b28be0321b589e98c8faf8968f7402db3e5c37919e1";
const testRskTxHash = "0xd8b96d2d48f2ab8298c95257ffc8a5b8992e6a6dad1f11d95644880ebce39a9a";
const testBtcRefundAddress = "tb1qkewsrkewj7wjxqrultxf9snaj7fut6hff66c5x";
const testBtcRecipientAddress = "mpKPLWXnmqjtXyoqi5yRBYgmF4PswMGj55";
const testRskSenderAddress = "0x3A29282d5144cEa68cb33995Ce82212f4B21ccEc";
const testBtcRawTx = "0200000001b2f339ac3c3726afaf42e92e0fe5af60b99241c8f3fcbe214d7e1198dd3a1f3301000000fd250100000000004d1d016453210208f40073a9e43b3e9103acec79767a6de9b0409749884e989960fee578012fce210225e892391625854128c5c4ea4340de0c2a70570f33db53426fc9c746597a03f421025a2f522aea776fab5241ad72f7f05918e8606676461cb6ce38265a52d4ca9ed62102afc230c2d355b1a577682b07bc2646041b5d0177af0f98395a46018da699b6da210344a3c38cd59afcba3edcebe143e025574594b001700dec41e59409bdbd0f2a09556702cd50b27552210216c23b2ea8e4f11c3f9e22711addb1d16a93964796913830856b568cc3ea21d3210275562901dd8faae20de0a4166362a4f82188db77dbed4ca887422ea1ec185f1421034db69f2112f4fb1bb6141bf6e2bd6631f0484d0bd95b16767902c9fe219d4a6f5368aeffffffff0214db0600000000001976a91460890b78920fed16f7505dc1e8b66ea249da062288ac4b6d70000000000017a9148f38b3d8ec8816f7f58a390f306bb90bb178d6ac8700000000";
const testRskRecipientAddress = "0x90f8bf6a479f320ead074411a4b0e7944ea8c9c1";
const testFederationAddress = "2N6JWYUb6Li4Kux6UB2eihT7n3rm3YX97uv";

describe('Controller: Tx Status', () => {
   let txStatusController: TxStatusController;
   let peginStatusService: StubbedInstanceWithSinonAccessor<PeginStatusService>;
   let pegoutStatusService: StubbedInstanceWithSinonAccessor<PegoutStatusService>;
   let flyoverService: StubbedInstanceWithSinonAccessor<RegisterFlyoverService>;

   function resetController() {
      peginStatusService = createStubInstance(PeginStatusService);
      pegoutStatusService = createStubInstance(PegoutStatusService);
      flyoverService = createStubInstance(RegisterFlyoverService);
      txStatusController = new TxStatusController(peginStatusService, pegoutStatusService, flyoverService);
   }
   function getMockedPeginStatus(mockedTxId: string,status: Status): PeginStatus {
      const btcPeginStatus = new BtcPeginStatus(mockedTxId);
      btcPeginStatus.federationAddress = testFederationAddress;
      btcPeginStatus.requiredConfirmation = 100;
      btcPeginStatus.confirmations = 60;
      btcPeginStatus.refundAddress = testBtcRefundAddress;
      btcPeginStatus.amountTransferred = 256893000
      btcPeginStatus.btcWTxId = mockedTxId;
      btcPeginStatus.creationDate = new Date(1653532992634);
      btcPeginStatus.fees = 5000;
      const peginStatus = new PeginStatus(btcPeginStatus);
      const rskPeginStatus = new RskPeginStatus();
      rskPeginStatus.confirmations = 50;
      rskPeginStatus.recipientAddress = testRskRecipientAddress;
      rskPeginStatus.createOn = new Date(1653532993634);
      rskPeginStatus.status = RskPeginStatusEnum.LOCKED;
      peginStatus.status = status;
      return peginStatus;
   }
   function getMockedPegoutStatus(rskTxId: string, status: PegoutStatus): PegoutStatusAppDataModel {
      const pegoutStatus = new PegoutStatusAppDataModel({
         originatingRskTxHash: rskTxId,
         valueRequestedInSatoshis: 200000,
         btcRawTransaction: testBtcRawTx,
         rskTxHash: rskTxId,
         btcRecipientAddress: testBtcRecipientAddress,
         feeInSatoshisToBePaid: 5000,
         valueInSatoshisToBeReceived: 195000,
         rskSenderAddress: testRskSenderAddress,
         status,
      });
      return pegoutStatus;
   }
   describe('PeginStatus', () => {
      beforeEach(resetController);

      it('should resolve a pegin txStatus: WAITING_CONFIRMATIONS', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testBtcTxHash)
             .resolves(getMockedPeginStatus(testBtcTxHash, Status.WAITING_CONFIRMATIONS));
         const txStatus = await txStatusController.getTxStatus(testBtcTxHash);
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.WAITING_CONFIRMATIONS);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: NOT_IN_RSK_YET', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testBtcTxHash)
             .resolves(getMockedPeginStatus(testBtcTxHash, Status.NOT_IN_RSK_YET));
         const txStatus = await txStatusController.getTxStatus(testBtcTxHash);
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.NOT_IN_RSK_YET);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: CONFIRMED', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testBtcTxHash)
             .resolves(getMockedPeginStatus(testBtcTxHash, Status.CONFIRMED));
         const txStatus = await txStatusController.getTxStatus(testBtcTxHash);
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.CONFIRMED);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: REJECTED_NO_REFUND', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testBtcTxHash)
             .resolves(getMockedPeginStatus(testBtcTxHash, Status.REJECTED_NO_REFUND));
         const txStatus = await txStatusController.getTxStatus(testBtcTxHash);
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.REJECTED_NO_REFUND);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: REJECTED_REFUND', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testBtcTxHash)
             .resolves(getMockedPeginStatus(testBtcTxHash, Status.REJECTED_REFUND));
         const txStatus = await txStatusController.getTxStatus(testBtcTxHash);
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.REJECTED_REFUND);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });
      it('should resolve a pegin txStatus: ERROR_BELOW_MIN', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testBtcTxHash)
             .resolves(getMockedPeginStatus(testBtcTxHash, Status.ERROR_BELOW_MIN));
         const txStatus = await txStatusController.getTxStatus(testBtcTxHash);
         expect(txStatus).to.be.instanceOf(TxStatus);
         expect(txStatus.type).to.be.eql(TxStatusType.PEGIN);
         expect(txStatus.txDetails?.status).to.eql(Status.ERROR_BELOW_MIN);
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
      });

   });

   describe('Pegout Status:', () => {
      beforeEach(resetController);
      it('should ask for pegout status if there is no a pegin', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testRskTxHash)
             .resolves(getMockedPeginStatus(testRskTxHash, Status.ERROR_NOT_A_PEGIN));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs(testRskTxHash)
             .resolves(getMockedPegoutStatus(testRskTxHash, PegoutStatus.RECEIVED));
         const status = await txStatusController.getTxStatus(testRskTxHash);
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.PEGOUT);
      });
      it('should ask for pegout status if pegin status service has an ERROR_UNEXPECTED', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testRskTxHash)
             .resolves(getMockedPeginStatus(testRskTxHash, Status.ERROR_UNEXPECTED));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs(testRskTxHash)
             .resolves(getMockedPegoutStatus(testRskTxHash, PegoutStatus.RECEIVED));
         const status = await txStatusController.getTxStatus(testRskTxHash);
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.PEGOUT);
      });
      it('should ask for pegout status if tx id are not in BTC yet', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testRskTxHash)
             .resolves(getMockedPeginStatus(testRskTxHash, Status.NOT_IN_BTC_YET));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs(testRskTxHash)
             .resolves(getMockedPegoutStatus(testRskTxHash, PegoutStatus.RECEIVED));
         const status = await txStatusController.getTxStatus(testRskTxHash);
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.PEGOUT);
      });
      it('should resolve a valid pegout status', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testRskTxHash)
             .resolves(getMockedPeginStatus(testRskTxHash, Status.NOT_IN_BTC_YET));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs(testRskTxHash)
             .resolves(getMockedPegoutStatus(testRskTxHash, PegoutStatus.RECEIVED));
         const status = await txStatusController.getTxStatus(testRskTxHash);
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status).to.be.deepEqual(new TxStatus({
            type: TxStatusType.PEGOUT,
            txDetails: new PegoutStatusAppDataModel({
               originatingRskTxHash: testRskTxHash,
               valueRequestedInSatoshis: 200000,
               btcRawTransaction: testBtcRawTx,
               rskTxHash: testRskTxHash,
               btcRecipientAddress: testBtcRecipientAddress,
               feeInSatoshisToBePaid: 5000,
               valueInSatoshisToBeReceived: 195000,
               rskSenderAddress: testRskSenderAddress,
               status: PegoutStatus.RECEIVED,
            }),
         }));
      });
      it('should resolve a txStatus: INVALID_DATA if it is not pegin status nor pegout status', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testRskTxHash)
             .resolves(getMockedPeginStatus(testRskTxHash, Status.NOT_IN_BTC_YET));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs(testRskTxHash)
             .resolves(getMockedPegoutStatus(testRskTxHash, PegoutStatus.NOT_FOUND));
         const status = await txStatusController.getTxStatus(testRskTxHash);
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.INVALID_DATA);
      });
      it('should resolve a txStatus: INVALID_DATA if it is not a valid txId', async () => {
         const invalidTxId = 'invalid-tx-id'
         const status = await txStatusController.getTxStatus(invalidTxId);
         expect(peginStatusService.stubs.getPeginSatusInfo.notCalled).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.notCalled).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.INVALID_DATA);
      });
      it('should search for flyover transactions if there is no pegin or pegout status', async () => {
         peginStatusService.stubs.getPeginSatusInfo.withArgs(testRskTxHash)
            .resolves(getMockedPeginStatus(testRskTxHash, Status.ERROR_NOT_A_PEGIN));
         pegoutStatusService.stubs.getPegoutStatusByRskTxHash.withArgs(testRskTxHash)
            .resolves(getMockedPegoutStatus(testRskTxHash, PegoutStatus.NOT_FOUND));
         flyoverService.stubs.getFlyoverStatus.withArgs(testRskTxHash)
            .resolves({
               status: 'COMPLETED',
               type: 'pegout',
               txHash: testRskTxHash,
               date: +new Date(),
               amount: 0.005,
               fee: 0.00001,
            });
         const status = await txStatusController.getTxStatus(testRskTxHash);
         expect(peginStatusService.stubs.getPeginSatusInfo.calledOnce).to.be.true();
         expect(pegoutStatusService.stubs.getPegoutStatusByRskTxHash.calledOnce).to.be.true();
         expect(flyoverService.stubs.getFlyoverStatus.calledOnce).to.be.true();
         expect(status.type).to.be.eql(TxStatusType.FLYOVER_PEGOUT);
      });
   });
});
