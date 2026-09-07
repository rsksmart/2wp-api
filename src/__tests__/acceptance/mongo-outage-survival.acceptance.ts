import http from 'http';
import net, {AddressInfo} from 'net';
import {expect} from '@loopback/testlab';
import {ChildApi, delay, startApi} from './child-api';

const PORT = 43212;

/**
 * How long mongoose waits for a server before giving up.
 *
 * This is the number the whole test is built around, and the one thing that
 * makes the finding easy to record as not reproducible. The failing `connect()`
 * does not reject when the TCP connection is refused — it rejects when server
 * selection times out, which is mongoose's 30 s default and nothing this code
 * configures. `/health` answers its (correct) 500 after ~10 s, the mongoose
 * buffering timeout; the process dies twenty seconds later still. Any window
 * measured from the response and shorter than this sees a healthy process.
 *
 * Nothing else about the reproduction is delicate. Leaving `BLOCKBOOK_URL`
 * unconfigured was suspected of short-circuiting the check before it reached
 * Mongo; it does not — the database check runs first and unconditionally, and
 * the kill happens either way. The window is the whole trap.
 */
const MONGOOSE_SERVER_SELECTION_TIMEOUT_MS = 30_000;

/** Margin over the timeout, so a slow machine does not turn the kill into a pass. */
const OBSERVATION_WINDOW_MS = MONGOOSE_SERVER_SELECTION_TIMEOUT_MS + 15_000;

/**
 * An upstream that answers immediately, whatever it is asked.
 *
 * Both stubs exist for timing, not for fidelity. `/health` checks four
 * dependencies in sequence; pointed at the real Blockbook and RSK node from
 * `.env` the two network checks alone outlast `MAX_REQUEST_DURATION_MS`, so the
 * request deadline answers 503 and the database — the thing under test — never
 * shows up in the status code at all. Answering instantly makes the database the
 * only slow check and the only failing one.
 */
function startFastUpstream(
  handler: (body: string) => string,
): Promise<{url: string; stop: () => Promise<void>}> {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      res.end(handler(body));
    });
  });
  return new Promise(resolve =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        stop: () =>
          new Promise<void>(done => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      }),
    ),
  );
}

/** A JSON-RPC endpoint that refuses every call, immediately. */
const rskNodeHandler = (body: string): string => {
  const asError = (id: unknown) => ({
    jsonrpc: '2.0',
    id: id ?? 1,
    error: {code: -32000, message: 'stub node'},
  });
  try {
    const parsed = JSON.parse(body);
    return JSON.stringify(
      Array.isArray(parsed)
        ? parsed.map(call => asError(call?.id))
        : asError(parsed?.id),
    );
  } catch {
    return JSON.stringify(asError(1));
  }
};

/** Reserves a port and gives it straight back, so nothing is listening on it. */
function findClosedPort(): Promise<number> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.listen(0, '127.0.0.1', () => {
      const {port} = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });
}

describe('Mongo outage (Acceptance)', () => {
  let api: ChildApi;
  let blockbook: Awaited<ReturnType<typeof startFastUpstream>>;
  let rskNode: Awaited<ReturnType<typeof startFastUpstream>>;
  let closedMongoPort: number;

  before(async function () {
    this.timeout(30_000);
    blockbook = await startFastUpstream(() => '{}');
    rskNode = await startFastUpstream(rskNodeHandler);
    closedMongoPort = await findClosedPort();
  });

  after(async () => {
    await blockbook?.stop();
    await rskNode?.stop();
  });

  afterEach(() => api?.stop());

  it('survives an unauthenticated /health while Mongo is unreachable', async () => {
    api = await startApi(PORT, {
      // Every upstream pinned, so nothing here depends on what `.env` happens
      // to hold or on whether the real hosts are reachable from this machine.
      BLOCKBOOK_URL: `${blockbook.url}/`,
      RSK_NODE_HOST: rskNode.url,
      RSK_DB_CONNECTION_HOST: '127.0.0.1',
      RSK_DB_CONNECTION_PORT: String(closedMongoPort),
    });

    // What `/health` reports is already correct today, and must stay correct:
    // the fix is about surviving the report, not about changing it.
    const health = await fetch(`${api.baseUrl}/health`);
    expect(health.status).to.equal(500);
    const body = (await health.json()) as {dataBase: {up: boolean}};
    expect(body.dataBase.up).to.be.false();

    await delay(OBSERVATION_WINDOW_MS);

    expect(api.child.exitCode).to.be.null();
    expect((await fetch(`${api.baseUrl}/api`)).status).to.equal(200);
  }).timeout(180_000);

  it('does not log a fatal unhandled rejection for the failed connection', async () => {
    // The discriminator. Without this the first test could go green for the
    // wrong reason — a process that never reached Mongo at all is also a process
    // that is still alive.
    api = await startApi(PORT, {
      BLOCKBOOK_URL: `${blockbook.url}/`,
      RSK_NODE_HOST: rskNode.url,
      RSK_DB_CONNECTION_HOST: '127.0.0.1',
      RSK_DB_CONNECTION_PORT: String(closedMongoPort),
    });

    await fetch(`${api.baseUrl}/health`);
    await delay(OBSERVATION_WINDOW_MS);

    const log = api.output();
    // The connection really was attempted and really did fail: this is what
    // proves the test reached the code path at all.
    expect(log).to.match(/MongooseServerSelectionError/);
    // And it was handled rather than orphaned.
    expect(log).to.not.match(/"event":"unhandledRejection"/);
    expect(log).to.not.match(/Shutting down/);
  }).timeout(180_000);
});
