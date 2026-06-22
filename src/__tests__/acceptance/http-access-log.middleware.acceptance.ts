import {Client} from '@loopback/testlab';
import {expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';

describe('HttpAccessLogMiddleware - trace id resolution', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('sets an X-Request-Id header on API responses', async () => {
    const response = await client.get('/api').expect(200);
    const requestId = response.headers['x-request-id'];
    expect(requestId).to.be.a.String();
    // No inbound correlation headers -> a fresh 32-hex id is generated.
    expect(requestId).to.match(/^[0-9a-f]{32}$/);
  });

  it('uses the trace-id segment of an inbound W3C traceparent header', async () => {
    const traceId = 'abcdef0123456789abcdef0123456789';
    const response = await client
      .get('/api')
      .set('traceparent', `00-${traceId}-0123456789abcdef-01`)
      .expect(200);
    expect(response.headers['x-request-id']).to.equal(traceId);
  });

  it('falls back to x-trace-id when no traceparent is present', async () => {
    const traceId = 'my-trace-id-123';
    const response = await client
      .get('/api')
      .set('x-trace-id', traceId)
      .expect(200);
    expect(response.headers['x-request-id']).to.equal(traceId);
  });

  it('falls back to x-request-id when no trace headers are present', async () => {
    const requestId = 'inbound-request-id';
    const response = await client
      .get('/api')
      .set('x-request-id', requestId)
      .expect(200);
    expect(response.headers['x-request-id']).to.equal(requestId);
  });

  it('ignores an invalid traceparent and generates a fresh id', async () => {
    const response = await client
      .get('/api')
      .set('traceparent', '00-not-a-valid-traceparent')
      .expect(200);
    expect(response.headers['x-request-id']).to.match(/^[0-9a-f]{32}$/);
  });

  it('ignores an all-zero traceparent trace id and generates a fresh id', async () => {
    const response = await client
      .get('/api')
      .set('traceparent', '00-00000000000000000000000000000000-0123456789abcdef-01')
      .expect(200);
    expect(response.headers['x-request-id']).to.match(/^[0-9a-f]{32}$/);
  });

  it('ignores an oversized correlation id and generates a fresh id', async () => {
    const oversizedId = 'a'.repeat(200);
    const response = await client
      .get('/api')
      .set('x-trace-id', oversizedId)
      .expect(200);
    const requestId = response.headers['x-request-id'];
    expect(requestId).to.not.equal(oversizedId);
    expect(requestId).to.match(/^[0-9a-f]{32}$/);
  });

  it('ignores a correlation id with unsafe characters and generates a fresh id', async () => {
    const unsafeId = 'bad id with spaces & symbols!';
    const response = await client
      .get('/api')
      .set('x-trace-id', unsafeId)
      .expect(200);
    const requestId = response.headers['x-request-id'];
    expect(requestId).to.not.equal(unsafeId);
    expect(requestId).to.match(/^[0-9a-f]{32}$/);
  });
});
