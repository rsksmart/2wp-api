import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import mongoose from 'mongoose';
import {MongoDbDataSource} from '../datasources';
import {DatasourcesBindings} from '../dependency-injection-bindings';
import {SearchableModel} from '../models/rsk/searchable-model';
import {getMetricLogger} from '../utils/metric-logger';
import {GenericDataService} from './generic-data-service';

export abstract class MongoDbDataService<Type extends SearchableModel, T>
  implements GenericDataService<Type>
{
  mongoDbUri: string;
  logger: Logger;
  db: mongoose.Mongoose;
  mongoDbDataSource: MongoDbDataSource;
  constructor(
    @inject(DatasourcesBindings.MONGO_DB_DATASOURCE)
    mongoDbDataSource: MongoDbDataSource,
  ) {
    this.mongoDbDataSource = mongoDbDataSource;
    this.logger = getLogger(this.getLoggerName());
  }

  protected abstract getLoggerName(): string;

  protected abstract getConnector(): mongoose.Model<T>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract getByIdFilter(id: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected abstract getManyFilter(filter?: any): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getById(id: any): Promise<Type> {
    return new Promise<Type>((resolve, reject) => {
      if (!this.db) {
        this.start()
          .then(() =>
            this.getConnector()
              .findOne(this.getByIdFilter(id))
              .exec()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .then((result: any) => resolve(<Type>result)),
          )
          .catch(reject);
      } else {
        this.getConnector()
          .findOne(this.getByIdFilter(id))
          .exec()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .then((result: any) => resolve(<Type>result))
          .catch(reject);
      }
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getMany(query?: any): Promise<Type[]> {
    return new Promise<Type[]>((resolve, reject) => {
      this.getConnector()
        .find(this.getManyFilter(query))
        .exec()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(result => resolve(result.map((r: any) => <Type>r)))
        .catch(reject);
    });
  }

  set(data: Type): Promise<boolean> {
    const metricLogger = getMetricLogger(this.logger, 'set');
    return new Promise<boolean>((resolve, reject) => {
      if (!data) {
        const err = 'Data was not provided';
        this.logger.debug(err);
        reject(err);
      }
      this.start()
        .then(() => {
          const connector = this.getConnector();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const filter: any = {};
          filter[data.getIdFieldName()] = data.getId();
          // eslint-disable-next-line @typescript-eslint/no-floating-promises
          connector
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .findOneAndUpdate(filter, <any>data, {upsert: true}, (err: any) => {
              metricLogger();
              if (err) {
                this.logger.debug(
                  'There was an error trying to save data',
                  err,
                );
                reject(err);
              } else {
                resolve(true);
              }
            });
        })
        .catch(reject);
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete(id: any): Promise<boolean> {
    return this.getConnector()
      .findOneAndDelete(this.getByIdFilter(id))
      .exec()
      .then(() => true);
  }

  start(): Promise<void> {
    return this.mongoDbDataSource.getConnection().then(connection => {
      this.db = connection;
      this.logger.debug('Service started');
    });
  }

  stop(): Promise<void> {
    this.logger.debug('Service stopped');
    return Promise.resolve();
  }
}
