import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {config} from 'dotenv';
import {
  REST_DATASOURCE_OPTIONS,
  REST_OPERATION_TIMEOUT_MS,
} from './rest-datasource-budgets';

config();

const confg = {
  name: 'lastBlockProvider',
  connector: 'rest',
  baseUrl: process.env.BLOCKBOOK_URL,
  options: REST_DATASOURCE_OPTIONS,
  operations: [
    {
      template: {
        method: 'GET',
        url: '{baseUrl}/api/blocks',
        responsePath: '$',
        timeout: REST_OPERATION_TIMEOUT_MS,
      },
      functions: {
        lastBlockProvider: [],
      }
    },
  ],
};

// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class LastBlockProviderDataSource
  extends juggler.DataSource
  implements LifeCycleObserver {
  static dataSourceName = 'lastBlockProvider';
  static readonly defaultConfig = confg;

  constructor(
    @inject('datasources.config.lastBlockProvider', {optional: true})
    dsConfig: object = confg,
  ) {
    super(dsConfig);
  }
}
