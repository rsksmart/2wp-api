import {getLogger, Logger} from 'log4js';
import mongoose from 'mongoose';
import {SearchableModel} from '../models/rsk/searchable-model';
import {getMetricLogger} from '../utils/metric-logger';
import {GenericDataService} from './generic-data-service';

export abstract class MongoDbDataService<Type extends SearchableModel, T> implements GenericDataService<Type> {
  mongoDbUri: string;
  logger: Logger;
  db: mongoose.Mongoose;
  constructor(mongoDbUri: string) {
    this.mongoDbUri = mongoDbUri;
    this.logger = getLogger(this.getLoggerName());
  }

  protected abstract getLoggerName(): string;

  protected abstract getConnector(): mongoose.Model<T>;

  protected abstract getByIdFilter(id: any): any;

  protected abstract getManyFilter(filter?: any): any;

  getById(id: any): Promise<Type> {
    let p = Promise.resolve();
    if (!this.db) {
      p.then(() => this.start());
    }
    return p.then(() => {
      return this.getConnector()
        .findOne(this.getByIdFilter(id))
        .exec()
        .then((result: any) => (<Type>result)); // The db model matches the DTO model so parsing it should do the trick
    });
  }

  getMany(query?: any): Promise<Type[]> {
    return this.getConnector()
      .find(this.getManyFilter(query))
      .exec()
      .then(result => result.map((r: any) => (<Type>r)));
  }

  set(data: Type): Promise<boolean> {
    let metricLogger = getMetricLogger(this.logger, 'set');
    let p = Promise.resolve();
    if (!this.db) {
      p.then(() => this.start());
    }
    return p.then(() => {
      return new Promise((resolve, reject) => {
        if (!data) {
          let err = 'Data was not provided';
          this.logger.debug(err);
          reject(err);
        }
        let connector = this.getConnector();
        let filter: any = {};
        filter[data.getIdFieldName()] = data.getId();
        connector.findOneAndUpdate(filter, <any>data, {upsert: true}, (err: any) => {
          metricLogger();
          if (err) {
            this.logger.debug('There was an error trying to save data', err);
            reject(err);
          } else {
            resolve(true);
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
