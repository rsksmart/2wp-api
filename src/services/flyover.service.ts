import mongoose, { Schema } from 'mongoose';
import {QuoteDbModel, RegisterPayload} from '../models';
import {FlyoverStatuses, FlyoverStatusModel} from '../models/flyover-status.model';
import {MongoDbDataService} from './mongodb-data.service';
import { RskNodeService } from './rsk-node.service';

interface FlyoverStatusMongoModel extends mongoose.Document, FlyoverStatusModel {}

const quoteSchema = new Schema<QuoteDbModel>({
  agreementTimestamp: {type: Number},
  gasFeeOnWei: {type: Schema.Types.BigInt},
  nonce: {type: Schema.Types.BigInt},
  penaltyFeeOnWei: {type: Schema.Types.BigInt},
  btcRefundAddress: {type: String},
  lbcAddress: {type: String},
  lpBtcAddress: {type: String},
  rskRefundAddress: {type: String},
  liquidityProviderRskAddress: {type: String},
  callFeeOnSatoshi: {type: Schema.Types.BigInt},
  callOnRegister: {type: Boolean},
  confirmations: {type: Number},
  contractAddr: {type: String},
  data: {type: String},
  fedBTCAddr: {type: String},
  gasLimit: {type: Schema.Types.BigInt},
  lpCallTime: {type: Number},
  productFeeAmountOnSatoshi: {type: Schema.Types.BigInt},
  timeForDepositInSeconds: {type: Number},
  valueOnSatoshi: {type: Schema.Types.BigInt},
})

const FlyoverStatusSchema = new mongoose.Schema({
  txHash: {type: String, required: true},
  date: {type: Date, required: true},
  type: {type: String, required: true},
  amount: {type: Number, required: true}, 
  fee: {type: Number, required: true},
  blockToBeFinished: {type: Number, required: true},
  senderAddress: {type: String, required: true},
  recipientAddress: {type: String, required: true},
  quoteHash: {type: String, required: true},
  quote: quoteSchema,
  acceptedQuoteSignature: {type: String},
});

const FlyoverStatusConnector = mongoose.model<FlyoverStatusMongoModel>('FlyoverStatuses', FlyoverStatusSchema);

export class FlyoverService extends MongoDbDataService<FlyoverStatusModel, FlyoverStatusMongoModel> {

  rskNodeService = new RskNodeService();
  
  protected getLoggerName(): string {
    return 'flyoverService';
  }

  protected getConnector(): mongoose.Model<FlyoverStatusMongoModel, {}, {}> {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.verifyAndCreateConnectionIfIsNecessary();
    return FlyoverStatusConnector;
  }

  async verifyAndCreateConnectionIfIsNecessary() {
    await this.ensureConnection();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getByIdFilter(id: any) {
    return {txHash: id};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getManyFilter(filter?: any) {
    return filter;
  }

  async getFlyoverStatus(txHash: string): Promise<FlyoverStatusModel> {
    let status;
    const flyoverTx = await this.getById(txHash);
    if (!flyoverTx) return Promise.reject(new Error('Flyover tx not found'));

    const currentBlock = await this.rskNodeService.getBlockNumber();
    if (flyoverTx.blockToBeFinished <= currentBlock) {
      status = FlyoverStatuses.COMPLETED;
    } else {
      status = FlyoverStatuses.PENDING;
    }

    const statusModel = FlyoverStatusModel.clone(flyoverTx);
    statusModel.status = status;
    return statusModel;
  }

  async register(payload: RegisterPayload): Promise<boolean> {
    const currentBlock = await this.rskNodeService.getBlockNumber();
    const flyoverStatus = new FlyoverStatusModel();
    flyoverStatus.txHash = payload.txHash;
    flyoverStatus.date = new Date();
    flyoverStatus.type = payload.type;
    flyoverStatus.amount = payload.value;
    flyoverStatus.fee = (payload?.fee ?? 0) + (payload?.rskGas ?? 0);
    flyoverStatus.senderAddress = payload?.details?.senderAddress ?? '';
    flyoverStatus.recipientAddress = payload?.details?.recipientAddress ?? '';
    flyoverStatus.blockToBeFinished = currentBlock + Number(payload?.details?.blocksToCompleteTransaction ?? 0);
    flyoverStatus.quoteHash = payload?.quoteHash ?? '';
    flyoverStatus.quote = { ...payload?.quote , ...(payload?.quote?.gasLimit && { gasLimit: BigInt(payload?.quote?.gasLimit) })} as QuoteDbModel;
    flyoverStatus.acceptedQuoteSignature = payload?.acceptedQuoteSignature ?? '';
    return this.set(flyoverStatus);
  }
}
