import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';

const config = {
  name: 'utxoProvider',
  connector: 'rest',
  options: {
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
  },
  operations: [
    {
      template: {
        method: 'GET',
        url: `https://blockbook.trugroup.tech:19130/api/v1/utxo/{address}`,
        responsePath: '$[*]',
      },
      functions: {
        utxoProvider: ['address'],
      },
    },
  ],
};

// Observe application's life cycle to disconnect the datasource when
// application is stopped. This allows the application to be shut down
// gracefully. The `stop()` method is inherited from `juggler.DataSource`.
// Learn more at https://loopback.io/doc/en/lb4/Life-cycle.html
@lifeCycleObserver('datasource')
export class UtxoProviderDataSource
  extends juggler.DataSource
  implements LifeCycleObserver {
  static dataSourceName = 'utxoProvider';
  static readonly defaultConfig = config;

  constructor(
    @inject('datasources.config.utxoProvider', {optional: true})
    dsConfig: object = config,
  ) {
    super(dsConfig);
  }
}
