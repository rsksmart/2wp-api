import {ChildProcess, spawn} from 'child_process';
import net from 'net';
import path from 'path';
import {expect} from '@loopback/testlab';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const PORT = 43211;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Boots the real compiled entrypoint, so the process-level handlers in
 * `src/index.ts` are the ones under test. Booting the application object
 * directly would install none of them and prove nothing about the crash.
 */
async function startApi(env: Record<string, string> = {}): Promise<{
  child: ChildProcess;
  stdout: () => string;
}> {
  const child = spawn(process.execPath, ['dist/index.js', '--appmode=API'], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout?.on('data', d => (out += d));
  child.stderr?.on('data', d => (out += d));

  for (let i = 0; i < 80; i += 1) {
    if (await isServing()) {
      return {child, stdout: () => out};
    }
    await delay(250);
  }
  child.kill('SIGKILL');
  throw new Error(`API did not start. Output:\n${out}`);
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function isServing(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api`);
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Writes a raw request then resets the connection on the next macrotask. */
function writeThenReset(request: string): Promise<void> {
  return new Promise(resolve => {
    const socket = net.connect(PORT, '127.0.0.1', () => {
      socket.setNoDelay(true);
      socket.write(request, () => {
        setTimeout(() => {
          socket.resetAndDestroy();
          resolve();
        }, 0);
      });
    });
    socket.on('error', () => resolve());
  });
}

const STATIC_DIR_RESET = 'GET /%2e HTTP/1.1\r\nHost:a\r\n\r\n';
const SPEC_RESET =
  'GET /api HTTP/1.1\r\nHost:a\r\n\r\nGET /openapi.json HTTP/1.1\r\nHost:a\r\n\r\n';

describe('Response lifecycle (Acceptance)', () => {
  describe('a client reset cannot terminate the process', () => {
    it('survives a reset while the static root is being resolved', async () => {
      const {child} = await startApi();
      try {
        for (let i = 0; i < 3; i += 1) {
          await writeThenReset(STATIC_DIR_RESET);
          await delay(300);
        }
        await delay(1500);

        expect(await isServing()).to.be.true();
        expect(child.exitCode).to.be.null();
      } finally {
        child.kill('SIGKILL');
      }
    }).timeout(60000);

    it('survives a reset while the OpenAPI spec is being generated', async () => {
      const {child} = await startApi();
      try {
        for (let i = 0; i < 4; i += 1) {
          await writeThenReset(SPEC_RESET);
          await delay(350);
        }
        await delay(1500);

        expect(await isServing()).to.be.true();
        expect(child.exitCode).to.be.null();
      } finally {
        child.kill('SIGKILL');
      }
    }).timeout(60000);

    it('survives the same reset with the spec disabled in production', async () => {
      // Documents which environment each variant reaches: the spec route is
      // absent in production, so only the static variant applies there.
      const {child} = await startApi({NODE_ENV: 'production'});
      try {
        await writeThenReset(SPEC_RESET);
        await delay(300);
        await writeThenReset(STATIC_DIR_RESET);
        await delay(1500);

        expect(await isServing()).to.be.true();
      } finally {
        child.kill('SIGKILL');
      }
    }).timeout(60000);
  });

  describe('the landing page is still served', () => {
    it('answers GET / with the landing page as HTML', async () => {
      const {child} = await startApi();
      try {
        const res = await fetch(`${BASE_URL}/`);

        expect(res.status).to.equal(200);
        expect(res.headers.get('content-type')).to.match(/text\/html/);
        expect(await res.text()).to.match(/Two Way Peg API/);
      } finally {
        child.kill('SIGKILL');
      }
    }).timeout(60000);
  });
});
