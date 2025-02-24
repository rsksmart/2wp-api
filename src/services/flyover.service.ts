import mongoose, { Schema } from 'mongoose';
import { PeginQuoteDbModel, PegoutQuoteDbModel, RegisterPayload } from '../models';
import {FlyoverStatuses, FlyoverStatusModel} from '../models/flyover-status.model';
import {MongoDbDataService} from './mongodb-data.service';
import { RskNodeService } from './rsk-node.service';
import { stringWeiToDecimalString, stringSatoshiToDecimalString } from '../utils/parseUnits';
import * as constants from '../constants';

interface FlyoverStatusMongoModel extends mongoose.Document, FlyoverStatusModel {}

const FlyoverStatusSchema = new mongoose.Schema({
  txHash: {type: String, required: true},
  date: {type: Date, required: true},
  type: {type: String, required: true},
  amount: {type: String, required: true},
  fee: {type: String, required: true},
  blockToBeFinished: {type: String, required: true},
  senderAddress: {type: String, required: true},
  recipientAddress: {type: String, required: true},
  quoteHash: {type: String, required: true},
  quote: {type: Schema.Types.Mixed, required: true},
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

  async getFlyoverStatus(txHash: string): Promise<any> {
    let flyoverStatus;
    const flyoverTx = await this.getById(txHash);
    if (!flyoverTx) return Promise.reject(new Error('Flyover tx not found'));

    const currentBlock = await this.rskNodeService.getBlockNumber();
    if (flyoverTx.blockToBeFinished <= currentBlock) {
      flyoverStatus = FlyoverStatuses.COMPLETED;
    } else {
      flyoverStatus = FlyoverStatuses.PENDING;
    }

    return {
      type: flyoverTx.type,
      amount: flyoverTx.amount,
      fee: flyoverTx.fee,
      blockToBeFinished: flyoverTx.blockToBeFinished,
      senderAddress: flyoverTx.senderAddress,
      quoteHash: flyoverTx.quoteHash,
      txHash: flyoverTx.txHash,
      date: flyoverTx.date,
      recipientAddress: flyoverTx.recipientAddress,
      status: flyoverStatus,
      quote: flyoverTx.quote,
      acceptedQuoteSignature: flyoverTx.acceptedQuoteSignature,
    };
  }

  async register(payload: RegisterPayload): Promise<boolean> {
    const currentBlock = await this.rskNodeService.getBlockNumber();
    const flyoverStatus = new FlyoverStatusModel();
    const feePlusGas = (BigInt(payload?.fee ?? 0) + BigInt(payload?.rskGas ?? 0));
    if (payload.type === constants.TX_TYPE_PEGIN) {
      flyoverStatus.amount = stringSatoshiToDecimalString(payload.value);
      flyoverStatus.fee = stringSatoshiToDecimalString(feePlusGas.toString());
      flyoverStatus.quote = {
        ...payload?.quote,
        ...(payload?.quote?.callFeeOnSatoshi && { callFeeOnSatoshi: stringSatoshiToDecimalString(payload?.quote?.callFeeOnSatoshi) }),
        ...(payload?.quote?.gasFeeOnWei && { gasFeeOnWei: stringWeiToDecimalString(payload?.quote?.gasFeeOnWei) }),
        ...(payload?.quote?.gasLimit && { gasLimit: payload?.quote?.gasLimit }),
        ...(payload?.quote?.penaltyFeeOnWei && { penaltyFeeOnWei: stringWeiToDecimalString(payload?.quote?.penaltyFeeOnWei) }),
        ...(payload?.quote?.productFeeAmountOnSatoshi && { productFeeAmountOnSatoshi: stringSatoshiToDecimalString(payload?.quote?.productFeeAmountOnSatoshi) }),
        ...(payload?.quote?.valueOnSatoshi && { valueOnSatoshi: stringSatoshiToDecimalString(payload?.quote?.valueOnSatoshi) }),
      } as PeginQuoteDbModel;
    } else {
      flyoverStatus.amount = stringWeiToDecimalString(payload.value);
      flyoverStatus.fee = stringWeiToDecimalString(feePlusGas.toString());
      flyoverStatus.quote = {
        ...payload?.quote,
        ...(payload?.quote?.callFeeOnWei && { callFeeOnWei: stringWeiToDecimalString(payload?.quote?.callFeeOnWei) }),
        ...(payload?.quote?.gasFeeOnWei && { gasFeeOnWei: stringWeiToDecimalString(payload?.quote?.gasFeeOnWei) }),
        ...(payload?.quote?.penaltyFeeOnWei && { penaltyFeeOnWei: stringWeiToDecimalString(payload?.quote?.penaltyFeeOnWei) }),
        ...(payload?.quote?.productFeeAmountOnWei && { productFeeAmountOnWei: stringWeiToDecimalString(payload?.quote?.productFeeAmountOnWei) }),
        ...(payload?.quote?.valueOnWei && { valueOnWei: stringWeiToDecimalString(payload?.quote?.valueOnWei) }),
      } as PegoutQuoteDbModel;
    }
    flyoverStatus.txHash = payload.txHash;
    flyoverStatus.date = new Date();
    flyoverStatus.type = payload.type;
    flyoverStatus.senderAddress = payload?.details?.senderAddress ?? '';
    flyoverStatus.recipientAddress = payload?.details?.recipientAddress ?? '';
    flyoverStatus.blockToBeFinished = currentBlock + Number(payload?.details?.blocksToCompleteTransaction ?? 0);
    flyoverStatus.quoteHash = payload?.quoteHash ?? '';
    flyoverStatus.acceptedQuoteSignature = payload?.acceptedQuoteSignature ?? '';
    return this.set(flyoverStatus);
  }
}
