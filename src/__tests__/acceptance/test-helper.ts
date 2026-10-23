import {TwpapiApplication} from '../..';
import {
  createRestAppClient,
  givenHttpServerConfig,
  Client,
} from '@loopback/testlab';
import {
  RATE_LIMITER_KEY,
  RateLimiter,
} from '../../middleware/rate-limit.middleware';

export async function setupApplication(): Promise<AppWithClient> {
  const restConfig = givenHttpServerConfig({
    // Customize the server configuration here.
    // Empty values (undefined, '') will be ignored by the helper.
    //
    // host: process.env.HOST,
    // port: +process.env.PORT,
  });

  const app = new TwpapiApplication({
    rest: restConfig,
  });

  await app.boot();
  await app.start();

  const client = createRestAppClient(app);

  return {app, client};
}

export interface AppWithClient {
  app: TwpapiApplication;
  client: Client;
}

/**
 * Binds a limiter that never refuses, for suites that burst on purpose.
 *
 * The rate limiter is process-wide, so a suite exercising some *other* control
 * with a deliberate burst would otherwise spend the allowance of every suite
 * after it. Rate limiting itself is covered by its own suite, against the real
 * budgets.
 *
 * @param app - The application under test.
 */
export function bindPermissiveRateLimiter(app: TwpapiApplication): void {
  app.bind(RATE_LIMITER_KEY).to(
    new RateLimiter({
      limit: Number.MAX_SAFE_INTEGER,
      fanoutLimit: Number.MAX_SAFE_INTEGER,
      healthLimit: Number.MAX_SAFE_INTEGER,
      windowMs: 60_000,
      maxTracked: 16,
    }),
  );
}
