import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';

const config = {
  name: 'MongoTestUtxo',
  connector: 'mongodb',
  url: 'mongodb://localhost:27017/database',
  host: 'localhost',
  port: 27017,
  auth: {
    user: '2wp-api-user',
    password: '2wp-api-password',
  },
  database: 'database',
  useNewUrlParser: true,
};

// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class MongoDatasource
  extends juggler.DataSource
  implements LifeCycleObserver {
  static dataSourceName = 'MongoTestUtxo';
  static readonly defaultConfig = config;

  constructor(
    @inject('datasources.config.MongoTestUtxo', {optional: true})
    dsConfig: object = config,
  ) {
    super(dsConfig);
  }
}
