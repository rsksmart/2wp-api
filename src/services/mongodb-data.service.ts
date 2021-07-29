import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import mongoose from 'mongoose';
import {MongoDbDataSource} from '../datasources/mongodb.datasource';
import {SearchableModel} from '../models/rsk/searchable-model';
import {getMetricLogger} from '../utils/metric-logger';
import {GenericDataService} from './generic-data-service';

export abstract class MongoDbDataService<Type extends SearchableModel, T> implements GenericDataService<Type> {
  mongoDbUri: string;
  logger: Logger;
  db: mongoose.Mongoose;
  mongoDbDataSource: MongoDbDataSource;
  constructor(
    @inject('dataSources.MongoDbDataSource')
    mongoDbDataSource: MongoDbDataSource
  ) {
    this.mongoDbDataSource = mongoDbDataSource;
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

  delete(id: any): Promise<boolean> {
    return this.getConnector()
      .findOneAndDelete(this.getByIdFilter(id))
      .exec()
      .then(() => true);
  }

  start(): Promise<void> {
    return this.mongoDbDataSource.getConnection()
      .then((connection) => {
        this.db = connection;
        this.logger.debug('Service started')
      });
  }

  stop(): Promise<void> {
    this.logger.debug('Service stopped');
    return Promise.resolve();
  }

}
