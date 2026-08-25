import net from 'net';
import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {
  MAX_ERROR_RESPONSE_BYTES,
  MAX_REQUEST_BODY_BYTES,
} from '../../config/resource-budgets';
import {VALIDATION_ERROR_CODE} from '../../middleware/bounded-error-writer';
import {setupApplication, bindPermissiveRateLimiter} from './test-helper';

/** Builds the densest invalid body that still fits the request-body budget. */
function bodyAtBudget(item: () => string): string {
  const parts: string[] = [];
  let size = 0;
  const overhead = 40; // envelope + the U+0100 extra property
  for (;;) {
    const next = item();
    if (size + next.length + overhead >= MAX_REQUEST_BODY_BYTES) {
      break;
    }
    parts.push(next);
    size += next.length + 1;
  }
  // The extra non-Latin-1 property is the two-byte string promotion trick:
  // rejected by additionalProperties, and it doubles the serialized footprint by
  // forcing V8 to store the whole error document as UTF-16.
  return `{"addressList":[${parts.join(',')}],"Ā":0}`;
}

const numericBody = () => bodyAtBudget(() => '1');
const patternBody = () => bodyAtBudget(() => '""');

describe('Bounded validation errors (Acceptance)', () => {
  let app: TwpapiApplication;
  let client: Client;
  let baseUrl: string;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    bindPermissiveRateLimiter(app);
    baseUrl = app.restServer.url!;
  });

  after(async () => {
    await app.stop();
  });

  describe('the response contract', () => {
    it('returns a bounded body with a stable code and the failing path', async () => {
      const res = await client
        .post('/addresses-info')
        .send({addressList: ['NOT_AN_ADDRESS']})
        .expect(422);

      expect(res.body.error.code).to.equal(VALIDATION_ERROR_CODE);
      expect(res.body.error.statusCode).to.equal(422);
      expect(res.body.error.details).to.be.Array();
      expect(res.body.error.details[0]).to.have.property('path');
      expect(res.body.error.details[0]).to.have.property('code');
    });

    it('never echoes the schema pattern or the submitted value', async () => {
      const res = await client
        .post('/addresses-info')
        .send({addressList: ['REFLECTION_PROBE_<script>alert(1)</script>']})
        .expect(422);

      const text = JSON.stringify(res.body);
      expect(text).to.not.match(/REFLECTION_PROBE/);
      expect(text).to.not.match(/script/);
      expect(text).to.not.match(/a-km-zA-HJ-NP-Z/);
    });

    it('never includes a stack trace or Ajv info object', async () => {
      const res = await client.post('/addresses-info').send({addressList: [1]}).expect(422);
      const text = JSON.stringify(res.body);

      expect(text).to.not.match(/stack/i);
      expect(text).to.not.match(/"info"/);
    });
  });

  describe('content negotiation cannot reach a recursive serializer', () => {
    const cases: [string, string, Record<string, string>][] = [
      ['Accept: text/xml', '/addresses-info', {accept: 'text/xml'}],
      ['Accept: text/html', '/addresses-info', {accept: 'text/html'}],
      ['Accept: application/xml', '/addresses-info', {accept: 'application/xml'}],
      ['?_format=xml', '/addresses-info?_format=xml', {}],
      ['?_format=html', '/addresses-info?_format=html', {}],
    ];

    cases.forEach(([label, path, headers]) => {
      it(`answers JSON for ${label}`, async () => {
        const res = await client
          .post(path)
          .set(headers)
          .send({addressList: ['NOT_AN_ADDRESS']})
          .expect(422);

        expect(res.headers['content-type']).to.match(/application\/json/);
        expect(JSON.stringify(res.body)).to.not.match(/^"</);
        // An unsupported _format used to reflect its value into X-Warning.
        expect(res.headers['x-warning']).to.be.undefined();
      });
    });

    it('does not reflect an unsupported _format value into a header', async () => {
      const res = await client
        .post('/addresses-info?_format=%3Cscript%3E')
        .send({addressList: ['NOT_AN_ADDRESS']})
        .expect(422);

      expect(res.headers['x-warning']).to.be.undefined();
    });
  });

  describe('validation-error amplification regression', () => {
    it('bounds the response for a budget-filling numeric body', async () => {
      const res = await client
        .post('/addresses-info')
        .set({'content-type': 'application/json'})
        .send(numericBody())
        .expect(422);

      expect(Buffer.byteLength(JSON.stringify(res.body)))
        .to.be.lessThanOrEqual(MAX_ERROR_RESPONSE_BYTES);
    });

    it('bounds the response for a budget-filling pattern body', async () => {
      const res = await client
        .post('/addresses-info')
        .set({'content-type': 'application/json'})
        .send(patternBody())
        .expect(422);

      expect(Buffer.byteLength(JSON.stringify(res.body)))
        .to.be.lessThanOrEqual(MAX_ERROR_RESPONSE_BYTES);
    });

    it('bounds every response of a pipelined burst on one unread socket', async () => {
      // The attack shape: several budget-filling bodies written back-to-back on
      // a single connection whose responses are not read until the end. Assert
      // on total bytes rather than process survival, so the suite can never be
      // the thing that runs out of memory.
      const body = numericBody();
      const {port, hostname} = new URL(baseUrl);
      const request =
        'POST /addresses-info HTTP/1.1\r\n' +
        `Host: ${hostname}:${port}\r\n` +
        'Accept: text/xml\r\n' +
        'Connection: keep-alive\r\n' +
        'Content-Type: application/json\r\n' +
        `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n` +
        body;
      const BURST = 8;

      const received = await new Promise<string>((resolve, reject) => {
        const socket = net.connect(Number(port), hostname, () => {
          socket.write(request.repeat(BURST));
        });
        const chunks: Buffer[] = [];
        let seen = 0;
        const finish = () => {
          socket.destroy();
          resolve(Buffer.concat(chunks).toString('utf8'));
        };
        socket.on('data', chunk => {
          chunks.push(chunk);
          // Resolve as soon as every response has arrived; waiting for socket
          // inactivity would just burn the test timeout.
          seen += (chunk.toString('latin1').match(/HTTP\/1\.1 /g) ?? []).length;
          if (seen >= BURST) {
            finish();
          }
        });
        socket.setTimeout(10000, finish);
        socket.on('error', reject);
      });

      const statuses = received.match(/HTTP\/1\.1 (\d{3})/g) ?? [];
      expect(statuses.length).to.be.greaterThan(0);
      statuses.forEach(line => expect(line).to.equal('HTTP/1.1 422'));
      // Whole burst, headers included, must stay small.
      expect(Buffer.byteLength(received)).to.be.lessThanOrEqual(
        MAX_ERROR_RESPONSE_BYTES * BURST,
      );
      expect(received).to.not.match(/<\?xml/);
    }).timeout(30000);

    it('keeps serving requests after the burst', async () => {
      await client
        .post('/addresses-info')
        .send({addressList: ['NOT_AN_ADDRESS']})
        .expect(422);
    });
  });
});
