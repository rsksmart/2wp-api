import mongoose from 'mongoose';
import {SOURCES, TxHistory} from '../models/tx-history.model';
import {MongoDbDataService} from './mongodb-data.service';

interface TxHistoryMongoModel extends mongoose.Document, TxHistory {}
  
const TxHistorySchema = new mongoose.Schema({
  userAddress: {type: String, required: true, index: true},
  providerHash: {type: String, required: true, unique: true},
  fromToken: {type: String, required: true},
  fromNetwork: {type: String, required: true},
  toToken: {type: String, required: true},
  toNetwork: {type: String, required: true},
  date: {type: Date, required: true, index: true},
  sdkProvider: {type: String, required: true, enum: SOURCES},
  liquidityProviderId: {type: Number},
});

TxHistorySchema.index({ userAddress: 1, date: -1 });

const TxHistoryConnector = mongoose.model<TxHistoryMongoModel>('TxHistory', TxHistorySchema);

export class TxHistoryService extends MongoDbDataService<TxHistory, TxHistoryMongoModel> {
  
  // eslint-disable-next-line class-methods-use-this
  protected getLoggerName(): string {
    return 'txHistoryService';
  }

  protected getConnector(): mongoose.Model<TxHistoryMongoModel, {}, {}> {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.verifyAndCreateConnectionIfIsNecessary();
    return TxHistoryConnector;
  }

  async verifyAndCreateConnectionIfIsNecessary() {
    await this.ensureConnection();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, class-methods-use-this
  protected getByIdFilter(id: any) {
    return {providerHash: id};
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, class-methods-use-this
  protected getManyFilter(filter?: any) {
    return filter;
  }

  /**
   * Store a new transaction in the history
   * @param txHistory Transaction history item to store
   * @returns Promise<boolean> indicating success
   */
  async storeTransaction(txHistory: TxHistory): Promise<boolean> {
    try {
      const txHistoryInstance = Object.assign(new TxHistory(), txHistory)
      return await this.set(txHistoryInstance);
    } catch (error) {
      return false;
    }
  }

    /**
   * Get paginated transaction history by address
   * @param address The address to filter by
   * @param page The page number (starting from 1)
   * @param limit The number of results per page (default: 10)
   * @returns Promise<{ data: TxHistory[], total: number, page: number, totalPages: number }>
   */
    async getTransactionHistoryByAddress(
      address: string,
      page: number = 1,
    ): Promise<{ data: TxHistory[], total: number, page: number, totalPages: number }> {
      const limit = 10;
      const skip = (page - 1) * limit;
      const connector = this.getConnector();
      const [data, total] = await Promise.all([
        connector
          // eslint-disable-next-line @typescript-eslint/naming-convention
          .find({ userAddress: address }, { _id: 0, __v: 0 })
          .sort({ date: -1 })
          .skip(skip)
          .limit(limit)
          .lean()
          .exec() as Promise<TxHistory[]>,
        connector.countDocuments({ userAddress: address }).exec()
      ]);
  
      return {
        data,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    }
  
}

