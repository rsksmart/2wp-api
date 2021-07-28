import {getLogger, Logger} from 'log4js';
import mongoose from 'mongoose';
import {PeginStatusDataModel} from '../../models/rsk/pegin-status-data.model';
import {PeginStatusDataService} from './pegin-status-data.service';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface PeginStatusMongoModel extends mongoose.Document, PeginStatusDataModel {
}

const PeginStatusSchema = new mongoose.Schema({
  btcTxId: {type: String, required: true, unique: true},
  status: {type: String, required: true},
  rskBlockHeight: {type: Number, required: true},
  rskTxId: {type: String, required: true, unique: true},
  rskRecipient: {type: String, required: true},
  createdOn: {type: Date, required: true}
});

const PeginStatusConnector = mongoose.model<PeginStatusMongoModel>("PeginStatus", PeginStatusSchema);

export class PeginStatusMongoDbDataService implements PeginStatusDataService {
  mongoDbUri: string;
  logger: Logger;
  db: mongoose.Mongoose;
  constructor(mongoDbUri: string) {
    this.mongoDbUri = mongoDbUri;
    this.logger = getLogger('pegin-status-mongo-service');
  }

  getPeginStatus(btcTxId: string): Promise<PeginStatusDataModel> {
    let p = Promise.resolve();
    if (!this.db) {
      p.then(() => this.start());
    }
    return p.then(() => {
      return PeginStatusConnector
        .findOne({btcTxId: btcTxId})
        .exec()
        .then((result: any) => (<PeginStatusDataModel>result)); // The db model matches the DTO model so parsing it should do the trick
    });
  }

  setPeginStatus(data: PeginStatusDataModel): Promise<void> {
    let p = Promise.resolve();
    if (!this.db) {
      p.then(() => this.start());
    }
    return p.then(() => {
      return new Promise((resolve, reject) => {
        if (!data) {
          let err = 'data was not provided';
          this.logger.debug(err);
          reject(err);
        }
        let model = new PeginStatusConnector(data);
        model.save((err: any) => {
          if (err) {
            this.logger.debug('there was an error trying to save pegin status with btc tx id ' + data.btcTxId, err);
            reject(err);
          } else {
            this.logger.trace('properly saved item with btc tx id ' + data.btcTxId);
            resolve();
          }
        })
      });
    });
  }

  start(): Promise<void> {
    return mongoose.connect(this.mongoDbUri, {useUnifiedTopology: true})
      .then(
        (connection: mongoose.Mongoose) => {
          this.db = connection;
          this.logger.debug('connected to mongodb');
        },
        err => {
          this.logger.error('there was an error connecting to mongodb', err);
          throw err;
        }
      );
  }

  stop(): Promise<void> {
    this.logger.debug('Shutting down');
    return this.db.disconnect();
  }

}
