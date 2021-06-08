import {inject, lifeCycleObserver, LifeCycleObserver} from '@loopback/core';
import {juggler} from '@loopback/repository';
import {config} from 'dotenv';

config();

const blockBookUrl =
  process.env.BLOCKBOOK_URL ?? 'https://blockbook.trugroup.tech:19130';

const cfg = {
  name: 'txBroadcast',
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
        url: `${blockBookUrl}/api/v2/sendtx/{tx}`,
        responsePath: '$',
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
