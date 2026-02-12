import {createHash} from 'node:crypto';
import {Client, createClientForHandler, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';

describe('Request Security Middleware (Acceptance)', () => {
  let app: TwpapiApplication;
  let client: Client;
  let originalApiKey: string | undefined;

  const apiKey = 'test-api-key';

  const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

  before('setupApplication', async () => {
    originalApiKey = process.env.REQUEST_API_KEY;
    process.env.REQUEST_API_KEY = apiKey;

    app = new TwpapiApplication();
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
      .set('x-payload-hash', sha256(''))
      .expect(401)
      .expect(({body}) => {
        expect(body.error.message).to.equal('Invalid api key');
      });
  });

  it('accepts a request with valid security headers', async () => {
    await client
      .get('/api')
      .set('api_key', apiKey)
      .set('x-payload-hash', sha256(''))
      .expect(200)
      .expect(({body}) => {
        expect(body).to.have.property('version');
      });
  });
});
