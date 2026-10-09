import {inject} from '@loopback/core';
import {Histogram} from '@prometheus-io/client';
import mongoose from 'mongoose';
import {getLogger, Logger} from '../utils/logger';
import {MongoDbDataSource} from '../datasources/mongodb.datasource';
import {DatasourcesBindings} from '../dependency-injection-bindings';
import {SearchableModel} from '../models/rsk/searchable-model';
import {METRICS_PREFIX, metricsRegistry} from '../utils/metrics';
import {GenericDataService} from './generic-data-service';

// `collection` is the model's collection name, fixed in code, never request data.
const mongoOperationDurationSeconds = new Histogram<'operation' | 'collection'>({
  name: `${METRICS_PREFIX}mongo_operation_duration_seconds`,
  help: 'MongoDB operation duration in seconds, by operation and collection.',
  labelNames: ['operation', 'collection'],
  buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [metricsRegistry],
});

export abstract class MongoDbDataService<Type extends SearchableModel, T> implements GenericDataService<Type> {
  mongoDbUri: string;
  logger: Logger;
  db: mongoose.Mongoose;
  mongoDbDataSource: MongoDbDataSource;
  constructor(
    @inject(DatasourcesBindings.MONGO_DB_DATASOURCE)
    mongoDbDataSource: MongoDbDataSource
  ) {
    this.mongoDbDataSource = mongoDbDataSource;
    this.logger = getLogger(this.getLoggerName());
  }

  protected abstract getLoggerName(): string;

  protected abstract getConnector(): mongoose.Model<T>;

  protected abstract getByIdFilter(id: any): any;

  protected abstract getManyFilter(filter?: any): any;

  /**
   * Connects if there is no connection yet, and waits for it.
   *
   * The previous version resolved immediately and started the connection on a
   * derived promise it discarded, so it told every caller "connected" before
   * anything had been attempted, and a connection failure became an orphaned
   * rejection rather than this caller's problem.
   *
   * @throws Whatever the datasource raised while connecting.
   */
  async ensureConnection(): Promise<void> {
    if (!this.db) {
      await this.start();
    }
  }

  /**
   * Starts a connection attempt without waiting for it.
   *
   * `getConnector()` is synchronous — every read and write in every subclass
   * calls it inline — so it cannot await the connection, and making it async
   * would change the shape of five services and every one of their callers. The
   * caller does not lose the failure by not waiting for it here: it awaits the
   * query, and mongoose fails that query on its own once its buffering timeout
   * elapses. What the caller does lose is the *reason*, so it is logged.
   *
   * The `catch` is the point of this method. Without it the discarded promise
   * became an unhandled rejection the moment `ensureConnection` started
   * propagating failures properly.
   */
  protected connectInBackground(): void {
    this.ensureConnection().catch(err => {
      this.logger.warn(
        {method: 'connectInBackground', err},
        'Database connection attempt failed',
      );
    });
  }

  getById(id: any): Promise<Type> {
    return this.getConnector()
      .findOne(this.getByIdFilter(id))
      .exec()
      .then((result: any) => (<Type>result)); // The db model matches the DTO model so parsing it should do the trick
  }

  getMany(query?: any): Promise<Type[]> {
    return this.getConnector()
      .find(this.getManyFilter(query))
      .exec()
      .then(result => result.map((r: any) => (<Type>r)));
  }

  set(data: Type): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!data) {
        this.logger.debug({method: 'set'}, 'Data was not provided');
        reject('Data was not provided');
        return;
      }
      const connector = this.getConnector();
      const stopTimer = mongoOperationDurationSeconds.startTimer({
        operation: 'set',
        collection: connector.collection.collectionName,
      });
      const filter: any = {};
      filter[data.getIdFieldName()] = data.getId();
      connector.findOneAndUpdate(filter, <any>data, {upsert: true})
        .then(() => resolve(true))
        .catch((err) => {
          this.logger.debug({method: 'set', err});
          reject(err);
          })
        .finally(stopTimer);
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
        this.logger.debug({method: 'start'}, 'Service started');
      });
  }

  stop(): Promise<void> {
    this.logger.debug({method: 'stop'}, 'Service stopped');
    return Promise.resolve();
  }
}
