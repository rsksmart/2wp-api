import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';

const config = {
  name: 'Redis',
  connector: 'kv-redis',
  url: '',
  host: '127.0.0.1',
  port: 6379,
  password: '2wp-api-password',
  db: 1,
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
    dsConfig: object = config,
  ) {
    super(dsConfig);
  }
}
