import mongoose, { Schema } from 'mongoose';
import {FlyoverStatuses, FlyoverStatusModel} from '../models/flyover-status.model';
import {MongoDbDataService} from './mongodb-data.service';
import { RskNodeService } from './rsk-node.service';

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

}
