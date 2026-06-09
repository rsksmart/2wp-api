/* eslint-disable  @typescript-eslint/no-floating-promises */
import {inject} from '@loopback/core';
import {connect as connectToMongo, Mongoose} from 'mongoose';
import {getLogger, Logger} from '../utils/logger';
import {ConstantsBindings} from '../dependency-injection-bindings';

export class MongoDbDataSource {
  mongoDbUri: string;
  mongoose: Mongoose;
  logger: Logger;
  constructor(
    @inject(ConstantsBindings.MONGO_DB_USER)
      mongoDbUser: string,
    @inject(ConstantsBindings.MONGO_DB_PASSWORD)
      mongoDbPassword: string,
    @inject(ConstantsBindings.MONGO_DB_HOST)
      mongoDbHost: string,
    @inject(ConstantsBindings.MONGO_DB_PORT)
      mongoDbPort: string,
    @inject(ConstantsBindings.MONGO_DB_DATABASE)
      mongoDbDatabase: string,
    @inject(ConstantsBindings.MONGO_DB_AUTH_SOURCE)
      mongoDbAuthSource: string
  ) {
    this.mongoDbUri = `mongodb://${encodeURIComponent(mongoDbUser)}:${encodeURIComponent(mongoDbPassword)}@${mongoDbHost}:${mongoDbPort}/${mongoDbDatabase}?authSource=${mongoDbAuthSource}`;
    this.logger = getLogger('MongoDb');
  }

  getConnection(): Promise<Mongoose> {
    const p = Promise.resolve();
    if (!this.mongoose) {
      p.then(() => this.connect());
    }
    return p.then(() => this.mongoose);
  }

  connect(): Promise<void> {
    return connectToMongo(this.mongoDbUri)
      .then(
        (connection: Mongoose) => {
          this.mongoose = connection;
          this.logger.debug({method: 'connect'}, 'Connected to mongodb');
        },
        err => {
          this.logger.error({method: 'connect', err});
          throw err;
        }
      );
  }

  disconnect(): Promise<void> {
    const p = Promise.resolve();
    if (this.mongoose &&
      this.mongoose.STATES[this.mongoose.connection.readyState] != this.mongoose.STATES.disconnected.toString()) {
      p.then(() => this.mongoose.disconnect());
      p.then(() => {
        this.logger.debug({method: 'disconnect'}, 'Disconnected from mongodb');
      });
    }
    return p;
  }
}
