import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {connect as connectToMongo, Mongoose} from 'mongoose';
import {ConstantsBindings} from '../dependency-injection-bindings';

export class MongoDbDataSource {
  mongoDbUri: string;
  mongoose: Mongoose;
  logger: Logger;
  constructor(
    @inject(ConstantsBindings.MONGO_DB_URI)
    mongoDbUri: string
  ) {
    this.mongoDbUri = mongoDbUri;

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
    return connectToMongo(this.mongoDbUri, {useUnifiedTopology: true})
      .then(
        (connection: Mongoose) => {
          this.mongoose = connection;
          this.logger.trace('Connected to mongodb');
        },
        err => {
          this.logger.error('There was an error connecting to mongodb', err);
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
        this.logger.trace('Disconnected from mongodb');
      });
    }
    return p;
  }
}
