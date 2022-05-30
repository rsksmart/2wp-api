import mongoose from 'mongoose';
import {PegoutStatus, PegoutStatusDbDataModel} from '../../models/rsk/pegout-status-data-model';
import {MongoDbDataService} from '../mongodb-data.service';
import {PegoutStatusDataService} from './pegout-status-data.service';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface PegoutStatusMongoModel extends mongoose.Document, PegoutStatusDbDataModel {
}

const PegoutStatusSchema = new mongoose.Schema({
  originatingRskTxHash: {type: String, required: true},
  rskTxHash: {type: String, required: true, unique: true},
  rskSenderAddress: {type: String, required: true},
  btcRecipientAddress: {type: String, required: true},
  valueRequestedInSatoshis: {type: Number, required: true},
  valueInSatoshisToBeReceived: {type: Number, required: true},
  feeInSatoshisToBePaid: {type: Number, required: true},
  btcRawTransaction: {type: String, required: true},
  status: {type: String, required: true, enum: Object.values(PegoutStatus)},
  createdOn: {type: Date, required: true},
  rskBlockHeight: {type: Number, required: true},
  originatingRskBlockHeight: {type: Number, required: true}
});

const PegoutStatusConnector = mongoose.model<PegoutStatusMongoModel>("PegoutStatus", PegoutStatusSchema);

export class PegoutStatusMongoDbDataService extends MongoDbDataService<PegoutStatusDbDataModel, PegoutStatusMongoModel> implements PegoutStatusDataService {

  protected getLoggerName(): string {
    return 'pegoutStatusMongoService';
  }
  protected getConnector(): mongoose.Model<PegoutStatusMongoModel, {}, {}> {
    return PegoutStatusConnector;
  }
  protected getByIdFilter(id: any) {
    return {rskTxHash: id};
  }
  protected getManyFilter(filter?: any) {
    return filter;
  }

  public deleteByRskBlockHeight(rskBlockHeight: number): Promise<boolean> {
    return this.getConnector()
      .deleteMany({rskBlockHeight: rskBlockHeight})
      .exec()
      .then(() => true);
  }

  public getManyByOriginatingRskTxHash(originatingRskTxHash: string): Promise<PegoutStatusDbDataModel[]> {
    return this.getConnector()
    .find({originatingRskTxHash})
    .exec();
  }

  public getLastByOriginatingRskTxHash(originatingRskTxHash: string): Promise<PegoutStatusDbDataModel | null> {
    return this.getConnector()
    .find({originatingRskTxHash})
    .sort({createdOn: -1})
    .limit(1)
    .exec()
    .then((pegoutStatuses: PegoutStatusDbDataModel[]) => pegoutStatuses[0] || null);
  }

}
