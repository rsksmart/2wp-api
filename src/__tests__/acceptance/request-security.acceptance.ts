import {createHash} from 'node:crypto';
import {Client, createClientForHandler, expect, givenHttpServerConfig} from '@loopback/testlab';
import {TwpapiApplication} from '../..';

describe('Request Security Middleware (Acceptance)', () => {
  let app: TwpapiApplication;
  let client: Client;
  let originalApiKey: string | undefined;
  let originalSalt: string | undefined;

  const apiKey = 'test-api-key';
  const requestSalt = 'test-salt';

  const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');
  const requestHash = (payload: string): string => sha256(sha256(payload + requestSalt));
  const canonicalizeJson = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(item => canonicalizeJson(item));
    }

    if (value === null || typeof value !== 'object') {
      return value;
    }

    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right))
        .map(key => [key, canonicalizeJson((value as Record<string, unknown>)[key])]),
    );
  };

  const hashJsonPayload = (payload: unknown): string =>
    requestHash(JSON.stringify(canonicalizeJson(payload)));

  before('setupApplication', async () => {
    originalApiKey = process.env.REQUEST_API_KEY;
    originalSalt = process.env.REQUEST_SALT;
    process.env.REQUEST_API_KEY = apiKey;
    process.env.REQUEST_SALT = requestSalt;

    app = new TwpapiApplication({
      rest: givenHttpServerConfig({port: 0}),
    });
    await app.boot();
    await app.start();

    client = createClientForHandler(app.requestHandler);
  });

  after(async () => {
    if (originalApiKey === undefined) {
      delete process.env.REQUEST_API_KEY;
    } else {
      process.env.REQUEST_API_KEY = originalApiKey;
    }

    if (originalSalt === undefined) {
      delete process.env.REQUEST_SALT;
    } else {
      process.env.REQUEST_SALT = originalSalt;
    }

    await app.stop();
  });

  it('rejects a request with missing security headers', async () => {
    await client
      .get('/api')
      .expect(401)
      .expect(({body}) => {
        expect(body.error.message).to.equal("Missing 'api_key' header");
      });
  });

  it('rejects a request with invalid security headers', async () => {
    await client
      .get('/api')
      .set('api_key', 'invalid-api-key')
      .set('x-payload-hash', requestHash(''))
      .expect(401)
      .expect(({body}) => {
        expect(body.error.message).to.equal('Invalid api key');
      });
  });

  it('accepts a request with valid security headers', async () => {
    await client
      .get('/api')
      .set('api_key', apiKey)
      .set('x-payload-hash', requestHash(''))
      .expect(200)
      .expect(({body}) => {
        expect(body).to.have.property('version');
      });
  });

  it('returns cached response for repeated payload hash', async () => {
    const payloadHash = requestHash('');

    await client
      .get('/api')
      .set('api_key', apiKey)
      .set('x-payload-hash', payloadHash)
      .expect(200);

    await client
      .get('/api')
      .set('api_key', apiKey)
      .set('x-payload-hash', payloadHash)
      .expect(200)
      .expect('x-payload-hash-cache', 'HIT')
      .expect(({body}) => {
        expect(body).to.have.property('version');
      });
  });

  it('replays cached response for repeated /logs payload hash', async () => {
    const body = {
      type: 'error',
      operation: 'peginNative',
      location: 'frontend register',
      error: {
        message: 'wallet timeout',
        code: 504,
      },
    };
    const payloadHash = hashJsonPayload(body);

    await client
      .post('/logs')
      .set('api_key', apiKey)
      .set('x-payload-hash', payloadHash)
      .send(body)
      .expect(200);

    await client
      .post('/logs')
      .set('api_key', apiKey)
      .set('x-payload-hash', payloadHash)
      .send(body)
      .expect(200)
      .expect('x-payload-hash-cache', 'HIT');
  });
});
