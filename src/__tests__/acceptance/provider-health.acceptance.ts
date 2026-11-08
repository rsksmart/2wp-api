import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {ProviderHealthStore} from '../../services/provider-health';
import {setupApplication} from './test-helper';

describe('GET /health/providers', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('returns an empty list before the first check ends', async () => {
    // The job is off in .env.test, so nothing has been stored.
    const res = await client.get('/health/providers').expect(200);

    expect(res.body).to.deepEqual({providers: []});
  });

  it('returns what the background job stored, in the swap API format', async () => {
    const store = await app.get<ProviderHealthStore>(
      ServicesBindings.PROVIDER_HEALTH_STORE,
    );
    store.set('powpeg', {
      status: 'down',
      since: new Date('2026-11-08T09:58:30.000Z'),
      reason: 'no_capacity',
      durationMs: 120,
      checkedAt: new Date('2026-11-08T10:00:30.000Z'),
      opposingStreak: 0,
    });

    const res = await client
      .get('/health/providers')
      .expect(200)
      .expect('Content-Type', /application\/json/);

    expect(res.body).to.deepEqual({
      providers: [
        {
          provider: 'powpeg',
          status: 'down',
          reason: 'no_capacity',
          latencyMs: 120,
          checkedAt: '2026-11-08T10:00:30.000Z',
          since: '2026-11-08T09:58:30.000Z',
        },
      ],
    });
  });

  it('is described in the OpenAPI spec', async () => {
    const spec = await app.restServer.getApiSpec();

    expect(spec.paths).to.have.property('/health/providers');
  });
});
