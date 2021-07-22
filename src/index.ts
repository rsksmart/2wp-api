import {config} from 'dotenv';
import {configure, getLogger} from 'log4js';
import {ApplicationConfig, TwpapiApplication} from './application';
import {DaemonRunner} from './daemon-runner';

export * from './application';

enum APP_MODE {
  API,
  DAEMON,
  ALL
};

const searchAppMode = (): APP_MODE => {
  let arg = process.argv.find(a => a.startsWith('--appmode='));
  if (arg) {
    let value: string = arg.split('=')[1];
    let parsedEnum = APP_MODE[value as keyof typeof APP_MODE];
    return parsedEnum !== undefined ? parsedEnum : APP_MODE.ALL;
  }
  return APP_MODE.ALL;
};

export async function main(options: ApplicationConfig = {}): Promise<void> {
  configure('./log-config.json');

  let logger = getLogger('app');

  let api: TwpapiApplication;
  let daemon: DaemonRunner;

  let shuttingDown = false;
  async function shutdown() {
    if (!shuttingDown) {
      shuttingDown = true;
      if (api) {
        await api.stop();
      }
      if (daemon) {
        await daemon.stop();
      }
      logger.info('Shutting down');
    }
  }

  //catches ctrl+c event
  process.on('SIGINT', shutdown.bind(null));

  //catches uncaught exceptions
  process.on('uncaughtException', shutdown.bind(null));

  let appMode = searchAppMode();

  config();
  if (appMode == APP_MODE.API || appMode == APP_MODE.ALL) {
    api = new TwpapiApplication(options);
    await api.boot();
    await api.start();

    const url = api.restServer.url;
    logger.info(`Server is running at ${url}`);
  }
  if (appMode == APP_MODE.DAEMON || appMode == APP_MODE.ALL) {
    daemon = new DaemonRunner();
    await daemon.start();
  }
}

if (require.main === module) {
  // Run the application
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3000),
      host: process.env.HOST,
      // The `gracePeriodForClose` provides a graceful close for http/https
      // servers with keep-alive clients. The default value is `Infinity`
      // (don't force-close). If you want to immediately destroy all sockets
      // upon stop, set its value to `0`.
      // See https://www.npmjs.com/package/stoppable
      gracePeriodForClose: 5000, // 5 seconds
      openApiSpec: {
        // useful when used with OpenAPI-to-GraphQL to locate your application
        setServersFromRequest: true,
      },
    },
  };
  main(config).catch(err => {
    console.error('Cannot start the application.', err);
    process.exit(1);
  });
}
