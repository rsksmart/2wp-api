import mongoose from 'mongoose';
import {RegisterCallPayload, RegisterPayload} from '../models';
import {AppTxModel} from '../models/app-tx.model';
import {MongoDbDataService} from './mongodb-data.service';

interface AppTxMongoModel extends mongoose.Document, AppTxModel {}

const AppTxSchema = new mongoose.Schema({
  txHash: {type: String, required: true},
  type: {type: String, required: true},
  creationDate: {type: Date, required: true},
  value: {type: Number, required: true},
  wallet: {type: String, required: true},
  fee: {type: Number, required: true},
  rskGas: {type: Number, required: true},
  btcEstimatedFee: {type: Number, required: true},
  provider: {type: String, required: true},
});

const AppTxConnector = mongoose.model<AppTxMongoModel>('AppTxs', AppTxSchema);

export class RegisterService extends MongoDbDataService<AppTxModel, AppTxMongoModel> {
  protected getLoggerName(): string {
    return 'registerService';
  }

  protected getConnector(): mongoose.Model<AppTxMongoModel, {}, {}> {
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    this.verifyAndCreateConnectionIfIsNecessary();
    return AppTxConnector;
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

  async register(payload: RegisterPayload): Promise<boolean> {
    const tx = new AppTxModel();
    tx.txHash = payload.txHash;
    tx.type = payload.type;
    tx.creationDate = new Date();
    tx.value = payload.value;
    tx.wallet = payload.wallet;
    tx.addressType = payload.addressType ?? '';
    tx.fee = payload.fee ?? 0;
    tx.rskGas = payload.rskGas ?? 0;
    tx.btcEstimatedFee = payload.btcEstimatedFee ?? 0;
    tx.provider = payload.provider ?? '';
    this.logger.info(
      `[NEW_TX_CREATED] [type=${tx.type}, value=${tx.value}, fee=${tx.fee}, gas=${tx.rskGas}, estimatedFee=${tx.btcEstimatedFee}, provider=${tx.provider}, wallet=${tx.wallet}, addressType=${tx.addressType}, id=${tx.txHash}]`,
    );
    return this.set(tx);
  }

  async registerFlyoverCall(payload: RegisterCallPayload): Promise<boolean> {
    const { operationType, functionType, result } = payload;
    this.logger.info(
      `[NEW_FLYOVER_CALL] [type=${operationType}, call=${functionType}, response=${result}]`,
    );
    return true;
  }
}
