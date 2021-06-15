import {configure, getLogger} from 'log4js';
import {ApplicationConfig, TwpapiApplication} from './application';
import {DaemonRunner} from './daemon-runner';

export * from './application';

export async function main(
  options: ApplicationConfig = {},
): Promise<TwpapiApplication> {
  configure('./log-config.json');

  const logger = getLogger('app');

  async function shutdown() {
    await app.stop();
    daemon.stop();
    logger.info('Shutting down');
  }

  //catches ctrl+c event
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('SIGINT', shutdown.bind(null));

  // catches "kill pid" (for example: nodemon restart)
  // process.on('SIGUSR1', shutdown.bind(null, {exit: true}));
  // process.on('SIGUSR2', shutdown.bind(null, {exit: true}));

  //catches uncaught exceptions
  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  process.on('uncaughtException', shutdown.bind(null));

  const app = new TwpapiApplication(options);
  await app.boot();
  await app.start();

  const url = app.restServer.url;
  logger.info(`Server is running at ${url}`);

  let daemon: DaemonRunner = new DaemonRunner();

  daemon.start();

  return app;
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
