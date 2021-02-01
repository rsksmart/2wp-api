import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';

const config = {
  name: 'session',
  connector: 'mongodb',
  url: '',
  host: '127.0.0.1',
  port: 27017,
  user: 'user',
  password: 'x',
  database: 'database',
  useNewUrlParser: true
};

// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class SessionDataSource extends juggler.DataSource
  implements LifeCycleObserver {
  static dataSourceName = 'session';
  static readonly defaultConfig = config;

  constructor(
    @inject('datasources.config.session', {optional: true})
    dsConfig: object = config,
  ) {
    super(dsConfig);
  }
}
