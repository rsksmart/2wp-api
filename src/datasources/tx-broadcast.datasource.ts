import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {config} from 'dotenv';
import {
  REST_DATASOURCE_OPTIONS,
  REST_OPERATION_TIMEOUT_MS,
} from './rest-datasource-budgets';

config();

const cfg = {
  name: 'txBroadcast',
  connector: 'rest',
  baseUrl: process.env.BLOCKBOOK_URL,
  options: REST_DATASOURCE_OPTIONS,
  operations: [
    {
      template: {
        method: 'GET',
        url: '{baseUrl}/api/v2/sendtx/{tx}',
        responsePath: '$',
        timeout: REST_OPERATION_TIMEOUT_MS,
      },
      functions: {
        broadcast: ['tx'],
      },
    },
  ],
};

// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class TxBroadcastDataSource
  extends juggler.DataSource
  implements LifeCycleObserver
{
  static dataSourceName = 'txBroadcast';
  static readonly defaultConfig = cfg;

  constructor(
    @inject('datasources.config.txBroadcast', {optional: true})
    dsConfig: object = cfg,
  ) {
    super(dsConfig);
  }
}
