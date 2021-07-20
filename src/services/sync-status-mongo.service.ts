import mongoose from 'mongoose';
import {SyncStatusModel} from '../models/rsk/sync-status.model';
import {MongoDbDataService} from './mongodb-data.service';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface SyncStatusMongoModel extends mongoose.Document, SyncStatusModel {
}

const SyncStatusSchema = new mongoose.Schema({
  syncId: {type: Number, required: true, unique: true},
  rskBlockHeight: {type: Number, required: true},
  lastSyncedOn: {type: Date, required: true}
});

const SyncStatusConnector = mongoose.model<SyncStatusMongoModel>("SyncStatus", SyncStatusSchema);

export class SyncStatusMongoService extends MongoDbDataService<SyncStatusModel, SyncStatusMongoModel> {
  protected getConnector(): mongoose.Model<SyncStatusMongoModel, {}, {}> {
    return SyncStatusConnector;
  }

  protected getByIdFilter(id: any) {
    return {syncId: id};
  }

  protected getManyFilter(filter?: any) {
    return {};
  }


  protected getLoggerName(): string {
    return 'syncStatusMongoService';
  }
}
