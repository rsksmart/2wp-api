import {ChildProcess, spawn} from 'child_process';
import http from 'http';
import {AddressInfo} from 'net';
import path from 'path';
import {expect} from '@loopback/testlab';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PORT = 43217;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * The scenario recorded but never re-run: 48 concurrent `GET /tx`
 * against an upstream returning legitimate, large transactions.
 *
 * 7.5 MB is deliberately *under* `MAX_TX_PROVIDER_RESPONSE_BYTES`, so every
 * response is one the service is supposed to accept. Nothing here is refused for
 * being too big — what differs between the two children is only whether anything
 * bounds how many are materialized at once.
 */
const RESPONSE_BYTES = 7.5 * 1024 * 1024;
const CONCURRENCY = 48;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A Blockbook stand-in serving large but legitimate transactions. */
async function startUpstream(): Promise<{url: string; stop: () => Promise<void>}> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, {'content-type': 'application/json'});
    const head = `{"txid":"${'ab'.repeat(32)}","version":1,"vin":[],"vout":[],"blockhash":"0","blockheight":1,"confirmations":1,"time":1,"blocktime":1,"valueOut":"1","valueIn":"2","fees":"3","hex":"`;
    res.write(head);
    const chunk = 'ab'.repeat(64 * 1024);
    let written = head.length;
    const pump = () => {
      while (written < RESPONSE_BYTES) {
        if (res.writableEnded || res.destroyed) return;
        const ok = res.write(chunk);
        written += chunk.length;
        if (!ok) {
          res.once('drain', pump);
          return;
        }
      }
      res.end('"}');
    };
    pump();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const {port} = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    stop: () =>
      new Promise<void>(resolve => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

/**
 * The unbounded path, reproduced: buffer the whole body, turn it into a string,
 * parse it. That is what `loopback-connector-rest` did, with nothing limiting how
 * many ran at once.
 */
const UNBOUNDED_CHILD = `
const http = require('http');
const url = process.env.UPSTREAM + '/api/v1/tx/' + 'ab'.repeat(32);
const one = () => new Promise((resolve, reject) => {
  http.get(url, res => {
    const chunks = [];
    res.on('data', c => chunks.push(c));
    res.on('end', () => {
      // Resolve with the parsed transaction, not a field off it. A caller holds
      // the response it asked for — resolving with \`.txid\` frees each body as
      // soon as it parses and measures nothing.
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    res.on('error', reject);
  }).on('error', reject);
});
Promise.all(Array.from({length: ${CONCURRENCY}}, one))
  .then(rs => console.log('ALL_COMPLETED n=' + rs.length))
  .catch(e => console.log('REJECTED:' + e.message));
`;

interface ChildResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
}

function runUnbounded(upstream: string): Promise<ChildResult> {
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=256', '-e', UNBOUNDED_CHILD],
      {
        cwd: REPO_ROOT,
        env: {...process.env, UPSTREAM: upstream},
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let output = '';
    child.stdout.on('data', d => (output += d));
    child.stderr.on('data', d => (output += d));
    child.on('close', (code, signal) => resolve({code, signal, output}));
  });
}

/** Boots the real compiled entry point with a reduced heap. */
async function startApi(
  upstream: string,
): Promise<{child: ChildProcess; output: () => string}> {
  const child = spawn(
    process.execPath,
    ['--max-old-space-size=256', 'dist/index.js', '--appmode=API'],
    {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: '127.0.0.1',
        NODE_ENV: 'development',
        BLOCKBOOK_URL: upstream,
        // The limiter would otherwise refuse most of a 48-request burst before
        // it reached the code under test.
        RATE_LIMIT_MAX_REQUESTS: '10000',
        RATE_LIMIT_MAX_FANOUT_REQUESTS: '10000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let out = '';
  child.stdout?.on('data', d => (out += d));
  child.stderr?.on('data', d => (out += d));

  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(`${BASE_URL}/api`)).status === 200) {
        return {child, output: () => out};
      }
    } catch {
      /* not up yet */
    }
    await delay(250);
  }
  child.kill('SIGKILL');
  throw new Error(`API did not start. Output:\n${out}`);
}

/**
 * The only direct evidence that this is closed.
 *
 * Every other test asserts the response is bounded. None of them shows that this
 * load used to end the process, and a test that never sees the failure it
 * prevents is a claim rather than evidence. So the control runs here too, at the
 * same heap and against the same upstream.
 *
 * 256 MB rather than a production heap only moves the threshold; it makes the
 * case run in seconds.
 */
describe('Provider response OOM (Acceptance)', () => {
  let upstream: {url: string; stop: () => Promise<void>};

  before(async function () {
    this.timeout(30000);
    upstream = await startUpstream();
  });

  after(async () => {
    await upstream.stop();
  });

  it('control: buffering 48 of them unbounded ends the process', async () => {
    const {code, signal, output} = await runUnbounded(upstream.url);

    // Either failure counts, and which one arrives first is not the point. A
    // heap exhaustion aborts on SIGABRT; a single oversized string raises
    // `Cannot create a string longer than 0x1fffffe8 characters`, which is the
    // error that was absent from the allowlist in `index.ts` and so reached
    // `shutdown()`.
    const died =
      signal === 'SIGABRT' ||
      code === 134 ||
      /JavaScript heap out of memory|Cannot create a string longer than/.test(
        output,
      );

    expect(died).to.be.true();
    expect(output).to.not.match(/ALL_COMPLETED/);
  }).timeout(120000);

  it('the real API serves the same 48 and stays alive', async function () {
    this.timeout(180000);
    const {child, output} = await startApi(upstream.url);
    try {
      const results = await Promise.all(
        Array.from({length: CONCURRENCY}, () =>
          fetch(`${BASE_URL}/tx?tx=${'ab'.repeat(32)}`, {
            signal: AbortSignal.timeout(120000),
          })
            // Draining the body matters and is not incidental: a client that
            // requests a large response and never reads it leaves the bytes in
            // the process, and measuring without this reports a heap exhaustion
            // that says nothing about the provider budget. See the test below.
            .then(async r => {
              await r.arrayBuffer();
              return r.status;
            })
            .catch(() => 0),
        ),
      );

      expect(child.exitCode).to.be.null();
      expect(output()).to.not.match(/JavaScript heap out of memory/);
      expect(output()).to.not.match(/Cannot create a string longer than/);

      // Every one is served. The upstream pool serialises the fetches, so this
      // takes longer than 48 requests would unbounded — which is the trade the
      // pool exists to make.
      results.forEach(status => {
        expect(status).to.equal(200);
      });

      expect((await fetch(`${BASE_URL}/api`)).status).to.equal(200);
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('records what remains unbounded: 48 clients that never read at once', async function () {
    // Still a characterization test, and the limit is now a different one than it
    // was. The controls are no longer the missing piece — the time to react is.
    //
    // A sustained non-reader is dropped by the per-connection stall rule, and
    // several of them together are dropped by the aggregate ceiling, both proven
    // above. What neither reaches is forty-eight arriving simultaneously, and the
    // measurements say precisely why:
    //
    // - At the moment the process dies, ~1.0 s in, only **two** connections have
    //   been stuck long enough to qualify — 15 MB, just under the ceiling. The
    //   other ~37 were written too recently to have been judged yet.
    // - Total pending bytes at that point are ~100 MB, but counting *those*
    //   towards the ceiling is not available: 48 legitimate draining clients hold
    //   60 MB at peak, which is not separable from the 90 MB an attack reaches.
    //   Filtered by how long each connection has been stuck the same two figures
    //   are 0 MB and 30 MB, which is why the ceiling counts stuck bytes — and why
    //   it needs those connections to have existed for a moment first.
    // - The fatal allocation is `JSON.parse` on the *inbound* provider path. The
    //   retained outbound bodies raise the floor and the next large inbound parse
    //   goes over it.
    //
    // So at a 256 MB heap this burst is beyond what the service can hold whoever
    // is reading; the legitimate 48 survive only because they drain just fast
    // enough. The deployed heap ceiling is an open question with DevOps
    // (`docs/deployment-requirements-request.md`, A3/B5), and it is the number
    // that decides whether these controls have time to fire in production. That
    // is a capacity answer, not a control this file can add.
    this.timeout(180000);
    const {child, output} = await startApi(upstream.url);
    try {
      await Promise.all(
        Array.from({length: CONCURRENCY}, () =>
          fetch(`${BASE_URL}/tx?tx=${'ab'.repeat(32)}`, {
            signal: AbortSignal.timeout(60000),
          })
            // Deliberately no `arrayBuffer()`: headers only, body left unread.
            .then(r => r.status)
            .catch(() => 0),
        ),
      );
      await delay(2000);

      expect(output()).to.match(/JavaScript heap out of memory/);
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('drops several stuck connections on the aggregate ceiling, before the per-connection rule would', async function () {
    // The aggregate control, exercised at a size the process survives so that
    // what is being measured is the control and not the heap.
    //
    // Six non-reading clients hold ~45 MB between them, over
    // MAX_TOTAL_PENDING_OUTPUT_BYTES. Each one individually is well inside its
    // per-connection stall allowance of a full second, so nothing would have
    // dropped them yet — the sum is the only thing that has gone wrong, and the
    // sum is what no single connection can see.
    this.timeout(180000);
    const {child, output} = await startApi(upstream.url);
    try {
      const held = await Promise.all(
        Array.from({length: 6}, () =>
          fetch(`${BASE_URL}/tx?tx=${'ab'.repeat(32)}`, {
            signal: AbortSignal.timeout(60000),
          }).catch(() => null),
        ),
      );
      // Well under CONNECTION_OUTPUT_STALL_MS, so a drop here is the ceiling.
      await delay(600);

      expect(output()).to.match(/total pending response bytes over the process ceiling/);
      expect(child.exitCode).to.be.null();
      expect((await fetch(`${BASE_URL}/api`)).status).to.equal(200);
      held.forEach(r => r?.body?.cancel().catch(() => {}));
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('drops a single connection that stops reading its response', async function () {
    // What the in-flight sampler does that arrival-time sampling could not. One
    // client, one large response, never read: the socket sits over
    // MAX_CONNECTION_BUFFERED_BYTES with nothing draining it, and the connection
    // is dropped instead of being held for as long as the client cares to hold
    // it. This is the mechanism; the burst above is the case it does not scale
    // to in time.
    this.timeout(180000);
    const {child, output} = await startApi(upstream.url);
    try {
      // Headers only, body deliberately never consumed, and the response object
      // kept alive so the socket is not closed by garbage collection.
      const held = await fetch(`${BASE_URL}/tx?tx=${'ab'.repeat(32)}`, {
        signal: AbortSignal.timeout(60000),
      });
      expect(held.status).to.equal(200);

      await delay(4000);

      expect(output()).to.match(/Dropping connection/);
      expect(output()).to.match(/peer stopped draining its response/);
      // The connection went, the process did not.
      expect(child.exitCode).to.be.null();
      expect((await fetch(`${BASE_URL}/api`)).status).to.equal(200);
    } finally {
      child.kill('SIGKILL');
    }
  });

  it('still serves a large response to a client that reads it', async function () {
    // The false positive this control could cause, asserted directly rather than
    // inferred from the test above. A 7.5 MB transaction is a legitimate answer
    // and is far over `MAX_CONNECTION_BUFFERED_BYTES`; what keeps it served is
    // that a draining peer's buffer goes down between samples.
    this.timeout(180000);
    const {child, output} = await startApi(upstream.url);
    try {
      const res = await fetch(`${BASE_URL}/tx?tx=${'ab'.repeat(32)}`, {
        signal: AbortSignal.timeout(60000),
      });
      const body = await res.arrayBuffer();

      expect(res.status).to.equal(200);
      expect(body.byteLength).to.be.greaterThan(1024 * 1024);
      expect(output()).to.not.match(/Dropping connection/);
    } finally {
      child.kill('SIGKILL');
    }
  });
});
