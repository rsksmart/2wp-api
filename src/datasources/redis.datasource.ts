import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {config} from 'dotenv';

config();

const configuration = {
  name: 'Redis',
  connector: 'kv-redis',
  url: '',
  host: process.env.SESSIONDB_HOST,
  port: process.env.SESSIONDB_PORT,
  password: process.env.SESSIONDB_PASSWORD,
  db: process.env.SESSIONDB_INDEX,
};

// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class RedisDataSource
  extends juggler.DataSource
  implements LifeCycleObserver {
  static dataSourceName = 'Redis';
  static readonly defaultConfig = config;

  constructor(
    @inject('datasources.config.Redis', {optional: true})
    dsConfig: object = configuration,
  ) {
    super(dsConfig);
  }
}
