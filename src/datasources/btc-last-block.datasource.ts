import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {config} from 'dotenv';

config();

const blockBookUrl = process.env.BLOCKBOOK_URL;

const confg = {
  name: 'lastBlockProvider',
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
        url: `${blockBookUrl}/api/blocks`,
        responsePath: '$',
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
