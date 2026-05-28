import mongoose from 'mongoose';
import {SOURCES, TxHistory} from '../models/tx-history.model';
import {MongoDbDataService} from './mongodb-data.service';

interface TxHistoryMongoModel extends mongoose.Document, TxHistory {}
  
const TxHistorySchema = new mongoose.Schema({
  userAddress: {type: String, required: true, index: true},
  txHash: {type: String, required: true, unique: true},
  providerHash: {type: String, required: true, unique: true},
  fromTokenName: {type: String, required: true},
  fromNetworkName: {type: String, required: true},
  toTokenName: {type: String, required: true},
  toNetworkName: {type: String, required: true},
  fromAmount: {type: String, required: true},
  toAmount: {type: String, required: true},
  date: {type: Date, required: true, index: true},
  sdkProvider: {type: String, required: true, enum: SOURCES},
  liquidityProviderName: {type: String},
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
    return {txHash: id};
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
      const { fromNetworkName, toNetworkName } = txHistory;
      const trimmedFromNet = fromNetworkName.trim();
      const trimmedToNet = toNetworkName.trim();
      const txHistoryInstance = Object.assign(new TxHistory(), {...txHistory, fromNetworkName: trimmedFromNet, toNetworkName: trimmedToNet})
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
  
  async getTransactionByHash(hash: string): Promise<TxHistory | null> {
    const connector = this.getConnector();
    const tx = await connector.findOne({ txHash: hash }, { _id: 0, __v: 0 }).lean().exec();
    return tx;
  }
}

