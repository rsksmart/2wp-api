import {ChildProcess, spawn} from 'child_process';
import http from 'http';
import {AddressInfo} from 'net';
import path from 'path';
import {expect} from '@loopback/testlab';

/**
 * The deadline has to end a request the process cannot otherwise finish.
 *
 * Run in a child process on purpose: the budgets are read from the environment
 * at module load, so a 30 s production deadline cannot be shortened inside a
 * suite that has already imported them. A provider that accepts the connection
 * and then never answers is the shape that matters — nothing downstream
 * observes the abort signal, so only the forced write can end the request.
 */
const PORT = 43213;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEADLINE_MS = 1500;
const GRACE_MS = 250;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A provider that connects and then stays silent forever. */
function startSilentProvider() {
  const sockets: import('net').Socket[] = [];
  const server = http.createServer(() => {
    // Deliberately never responds and never closes.
  });
  server.on('connection', s => sockets.push(s));
  return new Promise<{url: string; stop: () => Promise<void>}>(resolve =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        stop: () =>
          new Promise<void>(done => {
            sockets.forEach(s => s.destroy());
            server.close(() => done());
          }),
      }),
    ),
  );
}

async function isServing(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api`, {
      signal: AbortSignal.timeout(1000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

describe('Request deadline (Acceptance)', () => {
  let child: ChildProcess;
  let provider: Awaited<ReturnType<typeof startSilentProvider>>;
  let output = '';

  before(async function () {
    this.timeout(90000);
    provider = await startSilentProvider();
    child = spawn(process.execPath, ['dist/index.js', '--appmode=API'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        HOST: '127.0.0.1',
        NODE_ENV: 'development',
        BLOCKBOOK_URL: provider.url,
        MAX_REQUEST_DURATION_MS: String(DEADLINE_MS),
        REQUEST_DEADLINE_GRACE_MS: String(GRACE_MS),
        // One attempt: retries would multiply the deadline rather than test it.
        PROVIDER_MAX_RETRIES: '0',
        PROVIDER_TIMEOUT_MS: '60000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', d => (output += d));
    child.stderr?.on('data', d => (output += d));

    for (let i = 0; i < 120; i += 1) {
      if (await isServing()) return;
      await delay(250);
    }
    child.kill('SIGKILL');
    throw new Error(`API did not start. Output:\n${output}`);
  });

  after(async () => {
    child?.kill('SIGKILL');
    await provider?.stop();
  });

  it('answers a stuck request with a bounded 503 instead of hanging', async () => {
    const startedAt = Date.now();
    const res = await fetch(`${BASE_URL}/utxo`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({addressList: ['1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2']}),
      signal: AbortSignal.timeout(20000),
    });
    const elapsed = Date.now() - startedAt;
    const body = (await res.json()) as {error: {statusCode: number; code: string}};

    expect(res.status).to.equal(503);
    expect(body.error.statusCode).to.equal(503);
    expect(body.error.code).to.equal('HTTP_503');
    // The whole point is that it ends near the deadline rather than waiting on
    // work that never finishes.
    expect(elapsed).to.be.greaterThanOrEqual(DEADLINE_MS);
    expect(elapsed).to.be.lessThan(DEADLINE_MS + 5000);
  }).timeout(40000);

  it('answers even when the stuck work never observes the abort signal', async () => {
    // `/estimate-fee` goes through the LoopBack REST connector, which offers no
    // cancellation seam at all. Aborting the signal therefore reaches nothing:
    // only a response written on the request's behalf can end this one, which
    // makes it the case the forced write exists for.
    const startedAt = Date.now();
    const res = await fetch(`${BASE_URL}/estimate-fee/3`, {
      signal: AbortSignal.timeout(20000),
    });
    const elapsed = Date.now() - startedAt;
    const body = (await res.json()) as {error: {statusCode: number}};

    expect(res.status).to.equal(503);
    expect(body.error.statusCode).to.equal(503);
    expect(elapsed).to.be.greaterThanOrEqual(DEADLINE_MS);
    expect(elapsed).to.be.lessThan(DEADLINE_MS + 5000);
  }).timeout(40000);

  it('keeps serving after a deadline breach', async () => {
    const res = await fetch(`${BASE_URL}/api`, {
      signal: AbortSignal.timeout(5000),
    });

    // A forced write must not take the process or the listener with it.
    expect(res.status).to.equal(200);
  }).timeout(30000);
});
