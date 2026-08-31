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

/** Deterministic unique legacy addresses: '1' + 33 base58 characters. */
function uniqueLegacyMainnet(index: number): string {
  const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = index + 1;
  let suffix = '';
  while (suffix.length < 33) {
    suffix = base58[n % base58.length] + suffix;
    n = Math.floor(n / base58.length) + 1;
  }
  return `1${suffix}`;
}

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

/**
 * A provider that answers, but slowly. Models the case that actually threatens
 * `/addresses-info` at the full list length: nothing is broken, every call
 * succeeds, and the request still cannot finish inside its own deadline.
 */
function startSlowProvider(perCallMs: number) {
  let served = 0;
  const body = JSON.stringify({page: 1, totalPages: 1, txids: []});
  const server = http.createServer((_req, res) => {
    served += 1;
    setTimeout(() => {
      res.setHeader('content-type', 'application/json');
      res.end(body);
    }, perCallMs);
  });
  return new Promise<{url: string; served: () => number; stop: () => Promise<void>}>(
    resolve =>
      server.listen(0, '127.0.0.1', () =>
        resolve({
          url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
          served: () => served,
          stop: () =>
            new Promise<void>(done => {
              server.closeAllConnections?.();
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
        // The readiness probe below polls up to 120 times at 250 ms against a
        // child running the real limiter, whose default allowance is 90 per
        // 30 s on this route. Past ~90 polls the probe starts refusing itself,
        // so a slow start would fail this suite for a reason unrelated to what
        // it tests.
        RATE_LIMIT_MAX_REQUESTS: '100000',
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
      body: JSON.stringify({addressList: [uniqueLegacyMainnet(0)]}),
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

/**
 * `ADDRESS_LIST_MAX_ITEMS` is 120, so `/addresses-info` walks 24 sequential
 * batches. This is the deliberate decision recorded in the docs: against a
 * uniformly slow provider such a request cannot fit its deadline, and the right
 * answer is a bounded 503 rather than a connection held open for minutes.
 */
describe('Full fan-out against a slow provider (Acceptance)', () => {
  const SLOW_PORT = 43214;
  const SLOW_BASE = `http://127.0.0.1:${SLOW_PORT}`;
  const SLOW_DEADLINE_MS = 2000;
  const PER_CALL_MS = 300;
  let child: ChildProcess;
  let provider: Awaited<ReturnType<typeof startSlowProvider>>;

  const slowIsServing = async () => {
    try {
      const res = await fetch(`${SLOW_BASE}/api`, {signal: AbortSignal.timeout(1000)});
      return res.ok;
    } catch {
      return false;
    }
  };

  before(async function () {
    this.timeout(90000);
    provider = await startSlowProvider(PER_CALL_MS);
    child = spawn(process.execPath, ['dist/index.js', '--appmode=API'], {
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        PORT: String(SLOW_PORT),
        HOST: '127.0.0.1',
        NODE_ENV: 'development',
        BLOCKBOOK_URL: provider.url,
        // Scaled down from the shipped 30 s so the shape is testable; the
        // arithmetic that matters is batches x per-batch latency vs the deadline.
        MAX_REQUEST_DURATION_MS: String(SLOW_DEADLINE_MS),
        REQUEST_DEADLINE_GRACE_MS: '250',
        PROVIDER_MAX_RETRIES: '0',
        // Same reason as the first child: the readiness probe must not spend the
        // limiter's allowance on itself.
        RATE_LIMIT_MAX_REQUESTS: '100000',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    for (let i = 0; i < 120; i += 1) {
      if (await slowIsServing()) return;
      await delay(250);
    }
    child.kill('SIGKILL');
    throw new Error('slow-provider API did not start');
  });

  after(async () => {
    child?.kill('SIGKILL');
    await provider?.stop();
  });

  it('refuses a full-length request it cannot finish, rather than hanging', async () => {
    const addressList = Array.from({length: 120}, (_, i) =>
      uniqueLegacyMainnet(i),
    );
    const startedAt = Date.now();
    const res = await fetch(`${SLOW_BASE}/addresses-info`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({addressList}),
      signal: AbortSignal.timeout(30000),
    });
    const elapsed = Date.now() - startedAt;

    // 503 is the documented answer here, and it arrives near the deadline
    // instead of after every one of the 24 batches has run.
    expect(res.status).to.equal(503);
    expect(elapsed).to.be.lessThan(SLOW_DEADLINE_MS + 5000);
  }).timeout(60000);

  it('completes a short request against the same slow provider', async () => {
    const res = await fetch(`${SLOW_BASE}/addresses-info`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({addressList: [uniqueLegacyMainnet(0)]}),
      signal: AbortSignal.timeout(20000),
    });

    // The deadline must bound the pathological case without penalising ordinary
    // traffic through the same slow provider.
    expect(res.status).to.equal(200);
  }).timeout(60000);
});

