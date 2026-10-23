import {ChildProcess, spawn} from 'child_process';
import path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/** A running API child process, and the handles a suite needs to drive it. */
export interface ChildApi {
  child: ChildProcess;
  baseUrl: string;
  /** Everything the child has written to stdout and stderr so far. */
  output: () => string;
  stop: () => void;
}

export const delay = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms));

/** Is something answering `GET /api` on this port with a 200? */
export async function isServing(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api`);
    return res.status === 200;
  } catch {
    return false;
  }
}

/** Waits for a child to exit, and reports how. */
export function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<{code: number | null; signal: NodeJS.Signals | null}> {
  return new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({code: child.exitCode, signal: child.signalCode});
      return;
    }
    const timer = setTimeout(
      () => resolve({code: child.exitCode, signal: child.signalCode}),
      timeoutMs,
    );
    timer.unref();
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({code, signal});
    });
  });
}

/**
 * Boots the real compiled entrypoint, so the process-level handlers in
 * `src/index.ts` are the ones under test. Booting the application object
 * directly would install none of them and prove nothing about the crash.
 *
 * The port is a parameter rather than a constant because more than one suite
 * boots a child now, and two suites sharing a port fail in a way that looks like
 * the behaviour under test rather than like a collision.
 *
 * @param port - Port the child listens on.
 * @param env - Environment overrides layered on top of the test process's own.
 *   These beat `.env`: the child loads dotenv, which never overwrites a variable
 *   that is already set.
 * @param entry - Script to run. Defaults to the real entry point; a fixture that
 *   calls `main()` and then misbehaves on purpose is the other caller.
 * @param extraArgs - Arguments appended after `--appmode=API`.
 * @returns Handles to the running child.
 */
export async function startApi(
  port: number,
  env: Record<string, string> = {},
  entry = 'dist/index.js',
  extraArgs: string[] = [],
): Promise<ChildApi> {
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [entry, '--appmode=API', ...extraArgs], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      NODE_ENV: 'development',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  child.stdout?.on('data', d => (out += d));
  child.stderr?.on('data', d => (out += d));

  const api: ChildApi = {
    child,
    baseUrl,
    output: () => out,
    stop: () => {
      child.kill('SIGKILL');
    },
  };

  for (let i = 0; i < 80; i += 1) {
    if (await isServing(baseUrl)) {
      return api;
    }
    await delay(250);
  }
  api.stop();
  throw new Error(`API did not start. Output:\n${out}`);
}
