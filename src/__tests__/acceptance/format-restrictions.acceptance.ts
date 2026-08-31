import http from 'http';
import net from 'net';
import zlib from 'zlib';
import {Client, expect} from '@loopback/testlab';
import sinon from 'sinon';
import {TwpapiApplication} from '../..';
import {MAX_REQUEST_BODY_BYTES} from '../../config/resource-budgets';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {UtxoProvider} from '../../services';
import {setupApplication, bindPermissiveRateLimiter} from './test-helper';

const ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const VALID_BODY = JSON.stringify({addressList: [ADDRESS]});

/**
 * POSTs with an explicit raw body so the Content-Type and Content-Encoding
 * headers are exactly what the test declares — supertest would otherwise
 * serialize and label the body itself.
 */
function postRaw(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  body: Buffer | string,
): Promise<{statusCode: number; contentType: string; body: string}> {
  return new Promise((resolve, reject) => {
    const target = new URL(path, baseUrl);
    const req = http.request(target, {method: 'POST', headers}, res => {
      let text = '';
      res.on('data', c => (text += c));
      res.on('end', () =>
        resolve({
          statusCode: res.statusCode ?? 0,
          contentType: (res.headers['content-type'] ?? '').split(';')[0],
          body: text,
        }),
      );
    });
    req.on('error', reject);
    req.end(body);
  });
}

/** Sends a body with Transfer-Encoding: chunked, so no Content-Length exists. */
function postChunked(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  body: Buffer,
): Promise<{statusCode: number; body: string}> {
  return new Promise((resolve, reject) => {
    const target = new URL(path, baseUrl);
    const req = http.request(
      target,
      {method: 'POST', headers: {...headers, 'transfer-encoding': 'chunked'}},
      res => {
        let text = '';
        res.on('data', c => (text += c));
        res.on('end', () =>
          resolve({statusCode: res.statusCode ?? 0, body: text}),
        );
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

/** Issues a bare request line for methods `fetch`/supertest refuse to send. */
function rawMethod(baseUrl: string, method: string): Promise<string> {
  const {port, hostname} = new URL(baseUrl);
  return new Promise(resolve => {
    const socket = net.connect(Number(port), hostname, () => {
      socket.write(
        `${method} /utxo HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\n\r\n`,
      );
    });
    let out = '';
    socket.on('data', d => (out += d.toString('latin1')));
    const done = () => resolve(out.split('\r\n')[0] || '(no response)');
    socket.on('close', done);
    socket.on('error', () => resolve('(socket error)'));
    setTimeout(() => {
      socket.destroy();
      done();
    }, 4000);
  });
}

describe('Format restrictions (Acceptance)', () => {
  let app: TwpapiApplication;
  let client: Client;
  let baseUrl: string;
  let utxoProviderService: UtxoProvider;
  let originalUtxoProvider: UtxoProvider['utxoProvider'];
  let utxoStub: sinon.SinonStub;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    bindPermissiveRateLimiter(app);
    baseUrl = app.restServer.url!;
    // The bound provider is a process-wide singleton, so the original has to go
    // back on it or later suites inherit the stub.
    utxoProviderService = await app.get(ServicesBindings.UTXO_PROVIDER_SERVICE);
    originalUtxoProvider = utxoProviderService.utxoProvider;
  });

  beforeEach(() => {
    utxoStub = sinon.stub().resolves([]);
    utxoProviderService.utxoProvider = utxoStub;
  });

  after(async () => {
    utxoProviderService.utxoProvider = originalUtxoProvider;
    await app.stop();
  });

  /**
   * SECURITY-CRITICAL. These assertions are the entire protection against a
   * remote process kill.
   *
   * The runtime's Brotli decoder has a state-corruption defect that faults
   * natively during request parsing — before any controller runs, and
   * uncatchable by `try/catch`. Upstream has cut no release containing the fix,
   * so the decoder is still in the process image; what is gone is its
   * *reachability*, via a single `inflate: false` in `withResourceBudgets`
   * (`src/application.ts`). That makes this the permanent control, not an
   * interim one, and these tests the only thing between a routine refactor and a
   * one-request remote kill.
   *
   * **Relaxing `inflate` to accommodate a client that compresses its requests
   * reintroduces that kill.** If such a client ever appears, the change is a
   * codec-specific guard, never flipping the flag.
   *
   * The payloads here are deliberately *not* the crafted block-switch vector
   * from the report: that vector is only meaningful against a vulnerable decoder,
   * and carrying a live process-kill payload in a suite that has to survive is a
   * worse trade than asserting the refusal with ordinary compressed bodies. The
   * substitution is deliberate, not an oversight.
   */
  describe('Content-Encoding is restricted to identity', () => {
    const compressed: [string, Buffer][] = [
      ['gzip', zlib.gzipSync(VALID_BODY)],
      ['deflate', zlib.deflateSync(VALID_BODY)],
      ['br', zlib.brotliCompressSync(VALID_BODY)],
    ];

    // `/broadcast` is the route the report names; `/utxo` is where the control
    // was first asserted. The control is parser-level so behaviour is identical,
    // but the suite should answer the report directly rather than by argument.
    const encodedRoutes: [string, string][] = [
      ['/utxo', VALID_BODY],
      ['/broadcast', JSON.stringify({data: '0x00'})],
    ];

    encodedRoutes.forEach(([route, body]) => {
      compressed.forEach(([encoding]) => {
        it(`rejects Content-Encoding: ${encoding} on ${route} with a bounded 415`, async () => {
          const payload =
            encoding === 'gzip'
              ? zlib.gzipSync(body)
              : encoding === 'deflate'
                ? zlib.deflateSync(body)
                : zlib.brotliCompressSync(body);

          const res = await postRaw(
            baseUrl,
            route,
            {'content-type': 'application/json', 'content-encoding': encoding},
            payload,
          );

          expect(res.statusCode).to.equal(415);
          expect(res.contentType).to.equal('application/json');
          // Refused outright: the request never reaches a controller, so no
          // decompressor ran on attacker-controlled bytes.
          sinon.assert.notCalled(utxoStub);
        });
      });
    });

    it('accepts an absent Content-Encoding', async () => {
      const res = await postRaw(
        baseUrl,
        '/utxo',
        {'content-type': 'application/json'},
        VALID_BODY,
      );

      expect(res.statusCode).to.equal(200);
    });

    it('accepts Content-Encoding: identity', async () => {
      const res = await postRaw(
        baseUrl,
        '/utxo',
        {'content-type': 'application/json', 'content-encoding': 'identity'},
        VALID_BODY,
      );

      expect(res.statusCode).to.equal(200);
    });

    it('rejects an unknown codec', async () => {
      const res = await postRaw(
        baseUrl,
        '/utxo',
        {'content-type': 'application/json', 'content-encoding': 'made-up'},
        VALID_BODY,
      );

      expect(res.statusCode).to.equal(415);
    });
  });

  describe('no decompressor is reachable', () => {
    it('refuses a large compressed chunked body instead of decoding it', async () => {
      // No Content-Length, and the payload decodes to almost nothing, so
      // neither the declared-length guard nor the decompressed-size limit can
      // fire. Without an encoding allowlist every one of these bytes reaches
      // the decoder.
      const wire = Buffer.concat([
        zlib.brotliCompressSync(VALID_BODY),
        Buffer.alloc(8 * 1024 * 1024, 0),
      ]);

      const res = await postChunked(
        baseUrl,
        '/utxo',
        {'content-type': 'application/json', 'content-encoding': 'br'},
        wire,
      );

      expect(res.statusCode).to.equal(415);
      sinon.assert.notCalled(utxoStub);
    }).timeout(30000);

    it('refuses the same large compressed chunked body on /broadcast', async () => {
      // The route the report names, exercised the same way: no Content-Length,
      // so nothing but the encoding allowlist can refuse these bytes.
      const wire = Buffer.concat([
        zlib.brotliCompressSync(JSON.stringify({data: '0x00'})),
        Buffer.alloc(8 * 1024 * 1024, 0),
      ]);

      const res = await postChunked(
        baseUrl,
        '/broadcast',
        {'content-type': 'application/json', 'content-encoding': 'br'},
        wire,
      );

      expect(res.statusCode).to.equal(415);
    }).timeout(30000);

    it('still bounds an oversized uncompressed chunked body', async () => {
      const oversized = JSON.stringify({
        addressList: ['x'.repeat(MAX_REQUEST_BODY_BYTES + 1024)],
      });

      const res = await postChunked(
        baseUrl,
        '/utxo',
        {'content-type': 'application/json'},
        Buffer.from(oversized),
      );

      expect(res.statusCode).to.equal(413);
    });
  });

  describe('Content-Type is restricted to JSON', () => {
    const bodyRoutes = ['/utxo', '/addresses-info', '/broadcast'];
    const rejected = [
      'text/plain',
      'application/xml',
      'text/xml',
      'application/x-www-form-urlencoded',
    ];

    bodyRoutes.forEach(route => {
      rejected.forEach(contentType => {
        it(`rejects ${contentType} on ${route}`, async () => {
          const res = await postRaw(
            baseUrl,
            route,
            {'content-type': contentType},
            VALID_BODY,
          );

          expect(res.statusCode).to.equal(415);
          expect(res.contentType).to.equal('application/json');
        });
      });

      it(`rejects an absent Content-Type on ${route}`, async () => {
        const res = await postRaw(baseUrl, route, {}, VALID_BODY);

        // A missing media type cannot be interpreted, so the body is refused
        // rather than guessed at. What matters is that it is a bounded 4xx and
        // no handler runs — previously this dereferenced an undefined body and
        // surfaced as an unhandled 500.
        expect(res.statusCode).to.be.within(400, 499);
        expect(res.contentType).to.equal('application/json');
        sinon.assert.notCalled(utxoStub);
      });
    });

    it('accepts application/json with a charset parameter', async () => {
      const res = await postRaw(
        baseUrl,
        '/utxo',
        {'content-type': 'application/json; charset=utf-8'},
        VALID_BODY,
      );

      expect(res.statusCode).to.equal(200);
    });
  });

  describe('responses are JSON regardless of what the client asks for', () => {
    const accepts = ['text/xml', 'application/xml', 'text/html', '*/*'];

    accepts.forEach(accept => {
      it(`answers JSON for a successful request with Accept: ${accept}`, async () => {
        const res = await postRaw(
          baseUrl,
          '/utxo',
          {'content-type': 'application/json', accept},
          VALID_BODY,
        );

        expect(res.statusCode).to.equal(200);
        expect(res.contentType).to.equal('application/json');
        expect(res.body.trimStart().startsWith('<')).to.be.false();
      });

      it(`answers JSON for a rejected request with Accept: ${accept}`, async () => {
        const res = await postRaw(
          baseUrl,
          '/utxo',
          {'content-type': 'application/json', accept},
          JSON.stringify({addressList: ['NOT_AN_ADDRESS']}),
        );

        expect(res.statusCode).to.equal(422);
        expect(res.contentType).to.equal('application/json');
        expect(res.body.trimStart().startsWith('<')).to.be.false();
      });
    });

    ['xml', 'html'].forEach(format => {
      it(`ignores ?_format=${format}`, async () => {
        const res = await postRaw(
          baseUrl,
          `/utxo?_format=${format}`,
          {'content-type': 'application/json'},
          JSON.stringify({addressList: ['NOT_AN_ADDRESS']}),
        );

        expect(res.contentType).to.equal('application/json');
        expect(res.body.trimStart().startsWith('<')).to.be.false();
      });
    });
  });

  describe('undeclared HTTP methods never reach business logic', () => {
    ['get', 'put', 'delete', 'patch'].forEach(method => {
      it(`does not route ${method.toUpperCase()} /utxo to the controller`, async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (client as any)[method]('/utxo').expect(404);
        sinon.assert.notCalled(utxoStub);
      });
    });

    ['TRACE', 'PROPFIND'].forEach(method => {
      it(`does not route ${method} to the controller`, async () => {
        const status = await rawMethod(baseUrl, method);

        expect(status).to.match(/^HTTP\/1\.1 40\d/);
        sinon.assert.notCalled(utxoStub);
      });
    });

    it('refuses an invalid method token', async () => {
      const status = await rawMethod(baseUrl, 'NOT_A_METHOD');

      expect(status).to.match(/^HTTP\/1\.1 400|^\(socket error\)|^\(no response\)/);
      sinon.assert.notCalled(utxoStub);
    });
  });
});

/**
 * SECURITY-CRITICAL — the same control as the encoding matrix above, asserted
 * against the one configuration that used to switch it off.
 *
 * `withResourceBudgets` (`src/application.ts`) used to return the caller's
 * options untouched whenever they carried any `requestBodyParser` of their own,
 * which silently dropped `inflate: false` along with the body limit and the
 * bounded Ajv hooks. Nothing supplied that config, so nothing exercised the
 * branch: the suite was green with the Brotli decoder one line away from being
 * reachable again from an unauthenticated route.
 *
 * So this suite boots the app the way that one-line change would have — a caller
 * asking for `inflate: true` outright — and asserts the refusal holds anyway.
 *
 * The payloads are ordinary compressed bodies, not the crafted block-switch
 * vector from the report, for the reason given above the encoding matrix: that
 * vector faults natively, so it would take the test runner down instead of
 * failing an assertion. The garbage-Brotli case below is the one that matters
 * for reachability — it is the body that a live decoder would try to decode and
 * fail on, so a status other than 415 means a decoder was constructed.
 */
describe('Format restrictions: caller-supplied body-parser config (Acceptance)', () => {
  let app: TwpapiApplication;
  let baseUrl: string;
  let utxoProviderService: UtxoProvider;
  let originalUtxoProvider: UtxoProvider['utxoProvider'];
  let utxoStub: sinon.SinonStub;

  before('setupApplication', async () => {
    // The adversarial caller: explicitly asking for request decompression.
    app = new TwpapiApplication({
      rest: {
        port: 0,
        host: '127.0.0.1',
        requestBodyParser: {json: {inflate: true}},
      },
    });
    bindPermissiveRateLimiter(app);
    await app.boot();
    await app.start();
    baseUrl = app.restServer.url!;
    utxoProviderService = await app.get(ServicesBindings.UTXO_PROVIDER_SERVICE);
    originalUtxoProvider = utxoProviderService.utxoProvider;
  });

  beforeEach(() => {
    utxoStub = sinon.stub().resolves([]);
    utxoProviderService.utxoProvider = utxoStub;
  });

  after(async () => {
    utxoProviderService.utxoProvider = originalUtxoProvider;
    await app.stop();
  });

  const encodings: [string, () => Buffer][] = [
    ['gzip', () => zlib.gzipSync(VALID_BODY)],
    ['deflate', () => zlib.deflateSync(VALID_BODY)],
    ['br', () => zlib.brotliCompressSync(VALID_BODY)],
  ];

  encodings.forEach(([encoding, payload]) => {
    it(`still refuses Content-Encoding: ${encoding} with a bounded 415`, async () => {
      const res = await postRaw(
        baseUrl,
        '/utxo',
        {'content-type': 'application/json', 'content-encoding': encoding},
        payload(),
      );

      expect(res.statusCode).to.equal(415);
      expect(res.contentType).to.equal('application/json');
      sinon.assert.notCalled(utxoStub);
    });
  });

  it('refuses a body that is not valid Brotli, without constructing a decoder', async () => {
    // A live decoder would fail on these bytes and surface that failure as some
    // other status. 415 means the request was refused on the header alone, 23
    // lines before body-parser would have called zlib.createBrotliDecompress().
    const res = await postRaw(
      baseUrl,
      '/utxo',
      {'content-type': 'application/json', 'content-encoding': 'br'},
      Buffer.from('not brotli at all'),
    );

    expect(res.statusCode).to.equal(415);
    sinon.assert.notCalled(utxoStub);
  });

  it('still serves an uncompressed request normally', async () => {
    const res = await postRaw(
      baseUrl,
      '/utxo',
      {'content-type': 'application/json'},
      VALID_BODY,
    );

    expect(res.statusCode).to.equal(200);
  });

  it('still bounds the request body end to end', async () => {
    // Note which control answers here: `requestBodyBudgetMiddleware` refuses on
    // the declared Content-Length before the parsers see anything, so this stays
    // green even with the parser limit dropped. It pins the boundary, not the
    // parser's own limit — that one is pinned by the unit suite.
    const res = await postRaw(
      baseUrl,
      '/utxo',
      {'content-type': 'application/json'},
      Buffer.alloc(MAX_REQUEST_BODY_BYTES + 1, 0x20),
    );

    expect(res.statusCode).to.equal(413);
    sinon.assert.notCalled(utxoStub);
  });
});
