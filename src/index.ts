import 'dotenv/config';
import {getLogger} from './utils/logger';
import {ApplicationConfig, TwpapiApplication} from './application';
import {DaemonRunner} from './daemon-runner';
import { ENVIRONMENT_PRODUCTION } from './constants';

export * from './application';

enum APP_MODE {
  API,
  DAEMON,
  ALL
};

const searchAppMode = (): APP_MODE => {
  const arg = process.argv.find(a => a.startsWith('--appmode='));
  if (arg) {
    const value: string = arg.split('=')[1];
    const parsedEnum = APP_MODE[value as keyof typeof APP_MODE];
    return parsedEnum !== undefined ? parsedEnum : APP_MODE.ALL;
  }
  return APP_MODE.ALL;
};

/**
 * Boots and starts the application in the mode selected by the `--appmode=` CLI
 * argument (`API`, `DAEMON`, or both when omitted/unrecognized). Registers
 * shutdown handlers for `SIGINT` and uncaught exceptions that stop whichever
 * of the REST API / daemon were started.
 *
 * @param options - LoopBack `ApplicationConfig` forwarded to `TwpapiApplication` when the API is started.
 * @returns Resolves once the selected component(s) have started; never resolves with a value.
 */
/**
 * Error codes that mean one request's response lifecycle broke, not that the
 * process is unsound.
 *
 * A client that disappears mid-response leaves framework and library callbacks
 * still holding a reference to a finished response; when one of them writes, Node
 * raises one of these. The affected request is already lost either way, but the
 * process is completely healthy — so tearing it down converts a per-request
 * defect into an outage that any client can trigger at will. These are logged
 * and survived; everything else keeps the shutdown behaviour.
 *
 * Scope matters as much as membership: this list is for codes that *only* a
 * response lifecycle produces. Codes that a dependency can also raise are
 * handled separately below, with provenance required.
 */
const RESPONSE_LIFECYCLE_ERROR_CODES: ReadonlySet<string> = new Set([
  'ERR_HTTP_HEADERS_SENT',
  'ERR_STREAM_WRITE_AFTER_END',
  'ERR_STREAM_ALREADY_FINISHED',
  'ERR_STREAM_DESTROYED',
]);

/**
 * Reset codes that are *not* specific to a response.
 *
 * The same two codes arise when Mongo, the RSK node or a provider drops a
 * connection. Surviving them unconditionally — as this list first did — leaves a
 * possibly degraded process alive with nothing to restart it, which is a worse
 * outcome than the per-request failure the allowlist exists for. So they are
 * survivable only with provenance pointing at a response.
 */
const PEER_RESET_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'EPIPE',
]);

/**
 * Does this reset look like a client that vanished while we were writing to it?
 *
 * Node attaches no reference to the stream that failed, so provenance has to come
 * from what it does attach. Two signals, both necessary:
 *
 * - **`syscall === 'write'`** — the failure happened while sending, which is what
 *   a disappearing client produces. A dependency dropping a connection surfaces
 *   on the read side.
 * - **no remote-peer identity** — an outbound connection's errors name the far
 *   end (`address`, `port`, `hostname`). An inbound response write does not.
 *
 * This is a heuristic, deliberately biased towards restarting: an unattributable
 * reset is treated as fatal, because a process in an unknown state serving
 * traffic is worse than a restart. The four codes above need no heuristic — they
 * can only come from a response.
 */
function isVanishedClientWrite(reason: unknown): boolean {
  const err = reason as
    | {syscall?: unknown; address?: unknown; port?: unknown; hostname?: unknown}
    | undefined;
  if (err?.syscall !== 'write') {
    return false;
  }
  return (
    err.address === undefined &&
    err.port === undefined &&
    err.hostname === undefined
  );
}

/** How long shutdown may take before the process exits regardless. */
const SHUTDOWN_TIMEOUT_MS = 5_000;

/**
 * Exit code used after a fatal condition.
 *
 * Deliberately `0`. A supervisor configured with `restart: unless-stopped` (see
 * `docker-compose.yml`) recovers the process either way; switching to a nonzero
 * code is a one-line change here if a deployment ever needs `on-failure`
 * semantics instead.
 */
const EXIT_CODE = 0;

/** Is this a broken-response-lifecycle error rather than a fatal fault? */
export function isResponseLifecycleError(reason: unknown): boolean {
  const code = (reason as {code?: unknown} | undefined)?.code;
  if (typeof code !== 'string') {
    return false;
  }
  if (RESPONSE_LIFECYCLE_ERROR_CODES.has(code)) {
    return true;
  }
  return PEER_RESET_ERROR_CODES.has(code) && isVanishedClientWrite(reason);
}

export async function main(options: ApplicationConfig = {}): Promise<void> {
  const logger = getLogger('app');

  let api: TwpapiApplication;
  let daemon: DaemonRunner;

  let shuttingDown = false;
  async function shutdown() {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    // Stop cleanly, but never let cleanup itself keep a dying process alive: a
    // hung stop() would otherwise wedge it indefinitely.
    const stopAll = (async () => {
      if (api) {
        await api.stop();
      }
      if (daemon) {
        await daemon.stop();
      }
    })();
    const timeout = new Promise<void>(resolve => {
      setTimeout(resolve, SHUTDOWN_TIMEOUT_MS).unref();
    });
    try {
      await Promise.race([stopAll, timeout]);
    } catch (err) {
      logger.warn({err}, 'Shutdown did not complete cleanly');
    }
    logger.info('Shutting down');
    process.exit(EXIT_CODE);
  }

  /**
   * Logs a process-level failure and shuts down unless it is a broken response
   * lifecycle, which affects one request and not the process.
   */
  const handleFatal = (kind: string) => (reason: unknown) => {
    if (isResponseLifecycleError(reason)) {
      logger.warn(
        {event: 'response_lifecycle_error', kind, err: reason as Error},
        'Response lifecycle error; request abandoned, process continues',
      );
      return;
    }
    logger.fatal({event: kind, err: reason as Error}, 'Fatal error');
    shutdown().catch(err => logger.error({err}, 'Shutdown failed'));
  };

  //catches ctrl+c event
  process.on('SIGINT', () => {
    shutdown().catch(err => logger.error({err}, 'Shutdown failed'));
  });

  //catches uncaught exceptions
  process.on('uncaughtException', handleFatal('uncaughtException'));

  // Without this listener Node treats an unhandled rejection as fatal. Late
  // response writes from ignored framework promises land here.
  process.on('unhandledRejection', handleFatal('unhandledRejection'));

  const appMode = searchAppMode();

  if (appMode == APP_MODE.API || appMode == APP_MODE.ALL) {
    api = new TwpapiApplication(options);
    await api.boot();
    await api.start();

    const {url} = api.restServer;
    logger.info({url}, 'Server is running');
  }
  if (appMode == APP_MODE.DAEMON || appMode == APP_MODE.ALL) {
    daemon = new DaemonRunner();
    await daemon.start();
  }
}

if (require.main === module) {
  // Run the application
  const config = {
    rest: {
      port: +(process.env.PORT ?? 3000),
      host: process.env.HOST,
      // The `gracePeriodForClose` provides a graceful close for http/https
      // servers with keep-alive clients. The default value is `Infinity`
      // (don't force-close). If you want to immediately destroy all sockets
      // upon stop, set its value to `0`.
      // See https://www.npmjs.com/package/stoppable
      gracePeriodForClose: 5000, // 5 seconds
      openApiSpec: {
        // useful when used with OpenAPI-to-GraphQL to locate your application
        setServersFromRequest: true,
        disabled: process.env.NODE_ENV === ENVIRONMENT_PRODUCTION
      },
      apiExplorer: {
        disabled: process.env.NODE_ENV === ENVIRONMENT_PRODUCTION
      }
    },
  };
  main(config).catch(err => {
    getLogger('app').fatal({err}, 'Cannot start the application');
    process.exit(1);
  });
}
