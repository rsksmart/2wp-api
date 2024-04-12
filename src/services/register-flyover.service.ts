import mongoose from 'mongoose';
import {RegisterPayload} from '../models';
import {FlyoverStatusModel} from '../models/flyover-status.model';
import {MongoDbDataService} from './mongodb-data.service';
import { RskNodeService } from './rsk-node.service';
import * as constants from '../constants';

interface FlyoverStatusMongoModel extends mongoose.Document, FlyoverStatusModel {}

const FlyoverStatusSchema = new mongoose.Schema({
  txHash: {type: String, required: true},
  date: {type: Date, required: true},
  type: {type: String, required: true},
  amount: {type: Number, required: true}, 
  fee: {type: Number, required: true},
  blockToBeFinished: {type: Number, required: true},
});

const FlyoverStatusConnector = mongoose.model<FlyoverStatusMongoModel>('FlyoverStatuses', FlyoverStatusSchema);

export class RegisterFlyoverService extends MongoDbDataService<FlyoverStatusModel, FlyoverStatusMongoModel> {

  rskNodeService = new RskNodeService();
  
  protected getLoggerName(): string {
    return 'registerFlyService';
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
    let status;
    const flyoverTx = await this.getById(txHash);
    if (!flyoverTx) return null;

    const currentBlock = await this.rskNodeService.getBlockNumber();
    if (flyoverTx.blockToBeFinished <= currentBlock) {
      status = constants.FLYOVER_STATUS_COMPLETED;
    } else {
      status = constants.FLYOVER_STATUS_PENDING;
    }

    return {
      txHash: flyoverTx.txHash,
      date: flyoverTx.date,
      type: flyoverTx.type,
      amount: flyoverTx.amount,
      fee: flyoverTx.fee,
      status,
    };
  }

  async register(payload: RegisterPayload): Promise<boolean> {
    const currentBlock = await this.rskNodeService.getBlockNumber();
    const flyoverStatus = new FlyoverStatusModel();
    flyoverStatus.txHash = payload.txHash;
    flyoverStatus.date = new Date();
    flyoverStatus.type = payload.type;
    flyoverStatus.amount = payload.value;
    flyoverStatus.fee = payload?.fee ?? 0;
    flyoverStatus.blockToBeFinished = currentBlock + Number(payload?.details?.blocksToCompleteTransaction ?? 0);
    return this.set(flyoverStatus);
  }
}
