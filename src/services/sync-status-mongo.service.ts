/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/naming-convention */
import {getLogger, Logger} from 'log4js';
import mongoose from 'mongoose';
import {SyncStatusModel} from '../models/rsk/sync-status.model';
import {MongoDbDataService} from './mongodb-data.service';
import {SyncStatusDataService} from './sync-status-data.service';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface SyncStatusMongoModel extends mongoose.Document, SyncStatusModel {
}

const SyncStatusSchema = new mongoose.Schema({
  rskBlockHeight: {type: Number, required: true, unique: true},
  rskBlockHash: {type: String, required: true, unique: true},
  rskBlockParentHash: {type: String, required: true, unique: true}
});

const SyncStatusConnector = mongoose.model<SyncStatusMongoModel>("SyncStatus", SyncStatusSchema);

// eslint-disable-next-line max-len
export class SyncStatusMongoService extends MongoDbDataService<SyncStatusModel, SyncStatusMongoModel> implements SyncStatusDataService {
  logger: Logger = getLogger('syncStatusMongoService');

  protected getConnector(): mongoose.Model<SyncStatusMongoModel, {}, {}> {
    return SyncStatusConnector;
  }

  protected getByIdFilter(id: any) {
    return {rskBlockHash: id};
  }

  protected getManyFilter(filter?: any) {
    return filter;
  }

  protected getLoggerName(): string {
    return 'syncStatusMongoService';
  }

  public getBestBlock(): Promise<SyncStatusModel | undefined> {
    return this.getConnector()
      .find() // find all records
      .sort({rskBlockHeight: -1}) // sort them by height descending
      .limit(1) // get the first one
      .exec()
      .then((result) => <SyncStatusModel>(result[0]))
      .catch((reason) => {
        this.logger.warn(`[getBestBlock] Got an error: ${reason}`);
        return undefined;
      });
  }
}
