import mongoose from 'mongoose';
import {
  PeginStatus,
  PeginStatusDataModel,
} from '../../models/rsk/pegin-status-data.model';
import {MongoDbDataService} from '../mongodb-data.service';
import {PeginStatusDataService} from './pegin-status-data.service';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface PeginStatusMongoModel
  extends mongoose.Document,
    PeginStatusDataModel {}

const PeginStatusSchema = new mongoose.Schema({
  btcTxId: {type: String, required: true, unique: true},
  status: {type: String, required: true, enum: Object.values(PeginStatus)},
  rskBlockHeight: {type: Number, required: true},
  rskTxId: {type: String, required: true, unique: true},
  rskRecipient: {type: String, required: true},
  createdOn: {type: Date, required: true},
});

const PeginStatusConnector = mongoose.model<PeginStatusMongoModel>(
  'PeginStatus',
  PeginStatusSchema,
);

export class PeginStatusMongoDbDataService
  extends MongoDbDataService<PeginStatusDataModel, PeginStatusMongoModel>
  implements PeginStatusDataService
{
  protected getLoggerName(): string {
    return 'peginStatusMongoService';
  }
  protected getConnector(): mongoose.Model<PeginStatusMongoModel, {}, {}> {
    return PeginStatusConnector;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getByIdFilter(id: any) {
    return {btcTxId: id};
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected getManyFilter(filter?: any) {
    return filter;
  }

  public deleteByRskBlockHeight(rskBlockHeight: number): Promise<boolean> {
    return this.getConnector()
      .deleteMany({rskBlockHeight: rskBlockHeight})
      .exec()
      .then(() => true);
  }
}
