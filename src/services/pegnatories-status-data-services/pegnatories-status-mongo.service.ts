import mongoose from 'mongoose';
import {PegnatoriesStatusDataModel} from '../../models/rsk/pegnatories-status-data.model';
import {MongoDbDataService} from '../mongodb-data.service';
import {PegnatoriesStatusDataService} from './pegnatories-status-data.service';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface PegnatoriesStatusMongoModel extends mongoose.Document, PegnatoriesStatusDataModel {
}

const PegnatoriesStatusSchema = new mongoose.Schema({
  txHash: {type: String, required: true, unique: true},
  blockNumber: {type: Number, required: true},
  blockHash: {type: String, required: true},
  pegnatoryAddress: {type: String, required: true},
  signature: {type: String, required: true},
  createdOn: {type: Date, required: true}
});

const PegnatoriesStatusConnector = mongoose.model<PegnatoriesStatusMongoModel>("PegnatoriesStatus", PegnatoriesStatusSchema);

export class PegnatoriesStatusMongoDbDataService extends MongoDbDataService<PegnatoriesStatusDataModel, PegnatoriesStatusMongoModel> implements PegnatoriesStatusDataService {

  protected getLoggerName(): string {
    return 'pegnatoriesStatusMongoService';
  }
  protected getConnector(): mongoose.Model<PegnatoriesStatusMongoModel, {}, {}> {
    return PegnatoriesStatusConnector;
  }
  protected getByIdFilter(id: any) {
    return {txId: id};
  }
  protected getManyFilter(filter?: any) {
    return filter;
  }

  // public deleteByRskBlockHeight(rskBlockHeight: number): Promise<boolean> {
  //   return this.getConnector()
  //     .deleteMany({rskBlockHeight: rskBlockHeight})
  //     .exec()
  //     .then(() => true);
  // }
}
