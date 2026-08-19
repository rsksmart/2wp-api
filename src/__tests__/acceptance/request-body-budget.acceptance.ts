import http from 'http';
import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {TwpapiApplication} from '../..';
import {MAX_REQUEST_BODY_BYTES} from '../../config/resource-budgets';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {UtxoProvider} from '../../services';
import {setupApplication} from './test-helper';

const ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

/**
 * POSTs a body with `Transfer-Encoding: chunked` and no `Content-Length`, so the
 * Content-Length guard cannot fire and only the body-parser backstop is left.
 */
function postChunked(
  url: string,
  path: string,
  body: string,
): Promise<{statusCode: number}> {
  return new Promise((resolve, reject) => {
    const target = new URL(path, url);
    const req = http.request(
      target,
      {
        method: 'POST',
        headers: {'content-type': 'application/json', 'transfer-encoding': 'chunked'},
      },
      res => {
        res.resume();
        res.on('end', () => resolve({statusCode: res.statusCode ?? 0}));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

describe('Request body budget (Acceptance)', () => {
  let app: TwpapiApplication;
  let baseUrl: string;
  let utxoProviderService: UtxoProvider;
  let originalUtxoProvider: UtxoProvider['utxoProvider'];

  before('setupApplication', async () => {
    ({app} = await setupApplication());
    baseUrl = app.restServer.url!;
    // The bound provider is a process-wide singleton, so the original has to go
    // back on it or later suites inherit the stub.
    utxoProviderService = await app.get(ServicesBindings.UTXO_PROVIDER_SERVICE);
    originalUtxoProvider = utxoProviderService.utxoProvider;
    utxoProviderService.utxoProvider = sinon.stub().resolves([]);
  });

  after(async () => {
    utxoProviderService.utxoProvider = originalUtxoProvider;
    await app.stop();
  });

  it('accepts a body inside the budget', async () => {
    const {statusCode} = await postChunked(
      baseUrl,
      '/utxo',
      JSON.stringify({addressList: [ADDRESS]}),
    );

    expect(statusCode).to.equal(200);
  });

  it('rejects an oversized chunked body with a 413, without a Content-Length to check', async () => {
    // One long-but-valid-shaped string, so the body is over budget before any
    // schema validation could reject it.
    const padding = 'x'.repeat(MAX_REQUEST_BODY_BYTES + 1024);
    const {statusCode} = await postChunked(
      baseUrl,
      '/utxo',
      JSON.stringify({addressList: [padding]}),
    );

    expect(statusCode).to.equal(413);
  });

  it('keeps serving requests after a budget rejection', async () => {
    const {statusCode} = await postChunked(
      baseUrl,
      '/utxo',
      JSON.stringify({addressList: [ADDRESS]}),
    );

    expect(statusCode).to.equal(200);
  });
});
