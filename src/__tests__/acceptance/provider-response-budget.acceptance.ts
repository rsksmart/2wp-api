import {expect} from '@loopback/testlab';
import http from 'http';
import {AddressInfo} from 'net';
import {TwpapiApplication} from '../..';
import {
  MAX_ERROR_RESPONSE_BYTES,
  MAX_TX_PROVIDER_RESPONSE_BYTES,
} from '../../config/resource-budgets';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../utils/resource-budget';
import {bindPermissiveRateLimiter, setupApplication} from './test-helper';

const TX_ID = 'ab'.repeat(32);

/**
 * A Blockbook stand-in that streams a transaction of a chosen size.
 *
 * A real server rather than an HTTP interceptor: the point is that the socket is
 * torn down mid-response, and only a real socket can show that.
 */
class FakeBlockbook {
  private server?: http.Server;
  /** Bytes actually written before the client hung up. */
  servedBytes = 0;
  /** How large a `hex` field to serve, in bytes of response. */
  responseBytes = 1024;

  async start(): Promise<string> {
    this.server = http.createServer((req, res) => {
      res.writeHead(200, {'content-type': 'application/json'});
      const head = `{"txid":"${TX_ID}","version":1,"vin":[],"vout":[],"blockhash":"0","blockheight":1,"confirmations":1,"time":1,"blocktime":1,"valueOut":"1","valueIn":"2","fees":"3","hex":"`;
      res.write(head);
      this.servedBytes += head.length;

      const chunk = 'ab'.repeat(32 * 1024);
      let written = head.length;
      const pump = () => {
        while (written < this.responseBytes) {
          if (res.writableEnded || res.destroyed) {
            return;
          }
          const ok = res.write(chunk);
          written += chunk.length;
          this.servedBytes += chunk.length;
          if (!ok) {
            res.once('drain', pump);
            return;
          }
        }
        res.end('"}');
      };
      pump();
    });

    await new Promise<void>(resolve =>
      this.server!.listen(0, '127.0.0.1', resolve),
    );
    const {port} = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>(resolve => {
      this.server?.closeAllConnections?.();
      this.server?.close(() => resolve());
    });
  }
}

/**
 * The public reproduction of the finding, end to end.
 *
 * `GET /tx` is unauthenticated and needs no database, so a single request used to
 * be enough: an oversized Blockbook response was buffered whole by
 * `loopback-connector-rest`, raised `Cannot create a string longer than
 * 0x1fffffe8 characters` from `postman-request`, and — that error not being in
 * the allowlist in `index.ts` — reached `shutdown()` and stopped the process.
 */
describe('Provider response budget (Acceptance)', () => {
  let app: TwpapiApplication;
  let baseUrl: string;
  let upstream: FakeBlockbook;
  let previousBlockbookUrl: string | undefined;

  before('setupApplication', async function () {
    this.timeout(60000);
    upstream = new FakeBlockbook();
    previousBlockbookUrl = process.env.BLOCKBOOK_URL;
    // Set before the app starts, but the services resolve it per call anyway —
    // which is itself a consequence of the migration: the datasources this
    // replaced captured the base URL once, at module load.
    process.env.BLOCKBOOK_URL = await upstream.start();

    ({app} = await setupApplication());
    bindPermissiveRateLimiter(app);
    baseUrl = app.restServer.url!;
  });

  after(async () => {
    await app.stop();
    await upstream.stop();
    process.env.BLOCKBOOK_URL = previousBlockbookUrl;
  });

  beforeEach(() => {
    resetMetricCounters();
    upstream.servedBytes = 0;
  });

  it('answers a legitimate multi-megabyte transaction', async () => {
    // First, because a budget that refuses real transactions is the failure
    // nobody notices. 4 MB is over the general provider budget and under the
    // dedicated one.
    upstream.responseBytes = 4 * 1024 * 1024;

    const res = await fetch(`${baseUrl}/tx?tx=${TX_ID}`, {
      signal: AbortSignal.timeout(25000),
    });
    const body = (await res.json()) as {hex: string};

    expect(res.status).to.equal(200);
    expect(body.hex.length).to.be.greaterThan(2_000_000);
    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.PROVIDER_RESPONSE_BYTES,
      }),
    ).to.equal(0);
  }).timeout(60000);

  it('answers boundedly when the upstream oversteps the budget', async () => {
    upstream.responseBytes = MAX_TX_PROVIDER_RESPONSE_BYTES * 3;

    const res = await fetch(`${baseUrl}/tx?tx=${TX_ID}`, {
      signal: AbortSignal.timeout(25000),
    });
    const body = await res.text();

    expect(res.status).to.equal(502);
    // None of the payload is reflected, and the answer stays inside the error
    // budget rather than growing with the thing it refused.
    expect(body).to.not.match(/abababab/);
    expect(body.length).to.be.below(MAX_ERROR_RESPONSE_BYTES);
  }).timeout(60000);

  it('tears the socket down instead of buffering the whole response', async () => {
    upstream.responseBytes = MAX_TX_PROVIDER_RESPONSE_BYTES * 8;

    await fetch(`${baseUrl}/tx?tx=${TX_ID}`, {
      signal: AbortSignal.timeout(25000),
    });

    // The distinction the finding turns on. The REST connector read the whole
    // body and only then failed; this stops shortly past the budget, so the
    // bytes the process ever holds are bounded by the budget and not by what
    // the upstream felt like sending.
    expect(upstream.servedBytes).to.be.lessThan(
      MAX_TX_PROVIDER_RESPONSE_BYTES * 4,
    );
  }).timeout(60000);

  it('records the violation with scalars and no payload', async () => {
    upstream.responseBytes = MAX_TX_PROVIDER_RESPONSE_BYTES * 3;

    await fetch(`${baseUrl}/tx?tx=${TX_ID}`, {
      signal: AbortSignal.timeout(25000),
    });

    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.PROVIDER_RESPONSE_BYTES,
      }),
    ).to.equal(1);
  }).timeout(60000);

  it('keeps serving afterwards', async () => {
    const res = await fetch(`${baseUrl}/api`);

    expect(res.status).to.equal(200);
  }).timeout(30000);
});
