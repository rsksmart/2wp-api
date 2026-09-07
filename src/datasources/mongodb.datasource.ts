import {inject} from '@loopback/core';
import {connect as connectToMongo, Mongoose} from 'mongoose';
import {getLogger, Logger} from '../utils/logger';
import {ConstantsBindings} from '../dependency-injection-bindings';

export class MongoDbDataSource {
  mongoDbUri: string;
  mongoose: Mongoose;
  logger: Logger;

  /**
   * The connection attempt currently in flight, if there is one.
   *
   * Without this, every caller that arrives while the database is unreachable
   * opens its own attempt and produces its own failure — one per in-flight
   * request, each waiting out the full server-selection timeout. What makes it
   * safe is that it is cleared when the attempt settles, success or failure: a
   * memoized promise that is never cleared caches the *failure* for the life of
   * the process, and the application never recovers when the database does.
   */
  private connecting?: Promise<void>;

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

  /**
   * The connection, opening one first if there is not one already.
   *
   * This used to build a resolved promise, hang the connection attempt off it as
   * a derived promise, and return the original. The attempt's rejection then
   * belonged to nobody — not to this caller, whose promise had already resolved,
   * and not to any request chain — so it reached `unhandledRejection` and took
   * the process down. `/health` was written defensively and still died: its
   * `catch` was attached to a different chain from the one that failed.
   *
   * @returns The connected `Mongoose` instance.
   * @throws Whatever mongoose raised, to the caller that asked for the connection.
   */
  async getConnection(): Promise<Mongoose> {
    if (!this.mongoose) {
      this.connecting ??= this.connect().finally(() => {
        this.connecting = undefined;
      });
      await this.connecting;
    }
    return this.mongoose;
  }

  async connect(): Promise<void> {
    try {
      this.mongoose = await connectToMongo(this.mongoDbUri);
      this.logger.debug({method: 'connect'}, 'Connected to mongodb');
    } catch (err) {
      this.logger.error({method: 'connect', err}, 'MongoDB connection failed');
      throw err;
    }
  }

  /**
   * Closes the connection, if one is open.
   *
   * The guard used to read `STATES[readyState] != STATES.disconnected.toString()`,
   * which compares a state *name* against `'0'` and is therefore true for every
   * state there is. Comparing the codes is what it meant to say.
   */
  async disconnect(): Promise<void> {
    if (
      !this.mongoose ||
      this.mongoose.connection.readyState === this.mongoose.STATES.disconnected
    ) {
      return;
    }
    await this.mongoose.disconnect();
    this.logger.debug({method: 'disconnect'}, 'Disconnected from mongodb');
  }
}
