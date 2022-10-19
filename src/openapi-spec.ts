import {ApplicationConfig} from '@loopback/core';
import {TwpapiApplication} from './application';

/**
 * Export the OpenAPI spec from the application
 */
async function exportOpenApiSpec(): Promise<void> {
  const config: ApplicationConfig = {
    rest: {
      port: +(process.env.PORT ?? 3000),
      host: process.env.HOST ?? 'localhost',
    },
  };
  const outFile = process.argv[2] ?? '';
  const app = new TwpapiApplication(config);
  await app.boot();
  await app.exportOpenApiSpec(outFile);
}

exportOpenApiSpec().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fail to export OpenAPI spec from the application.', err);
  process.exit(1);
});
