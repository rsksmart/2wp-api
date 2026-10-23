import 'dotenv/config';
import {getLogger} from './utils/logger';
import {ApplicationConfig, TwpapiApplication} from './application';
import {DaemonRunner} from './daemon-runner';
import { ENVIRONMENT_PRODUCTION } from './constants';
import {
  PROCESS_FAILURE_TRIPWIRE_MAX,
  PROCESS_FAILURE_TRIPWIRE_MAX_KINDS,
  PROCESS_FAILURE_TRIPWIRE_WINDOW_MS,
} from './config/resource-budgets';
import {FailureTripwire, failureKind} from './utils/failure-tripwire';

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
 * Error codes that mean one request's response lifecycle broke, not that the
 * process is unsound.
 *
 * A client that disappears mid-response leaves framework and library callbacks
 * still holding a reference to a finished response; when one of them writes, Node
 * raises one of these. The affected request is already lost either way, but the
 * process is completely healthy — so tearing it down converts a per-request
 * defect into an outage that any client can trigger at will.
 *
 * This list used to be the *only* thing standing between a failure and
 * `process.exit`, and that was the defect: a closed list in front of an open
 * set. Anything it did not name was fatal, including a `MongooseServerSelection
 * Error`, which carries no string `code` at all and so could never have matched
 * however carefully the list was maintained. An unauthenticated `GET /health`
 * with the database down was enough.
 *
 * What the list does now is narrower and it still earns its place: it marks the
 * failures that are *known* to be per-request, so they are logged at `warn`
 * rather than `error` and, more importantly, are kept out of the tripwire. A
 * burst of clients hanging up is ordinary traffic, and counting it as evidence
 * of a degraded process would hand any client the outage this list exists to
 * prevent.
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
 * This is a heuristic and an empirically shaky one, but the cost of it being
 * wrong has changed. It used to decide whether the process lived: a dependency
 * reset misread as a vanished client meant surviving something that should have
 * restarted. Now a rejection is survived either way, and the only thing this
 * decides is whether the failure counts towards the tripwire. Misreading a
 * dependency reset as a client hang-up costs a delay in tripping, not a
 * false survival. It is still worth fixing, in its own change.
 *
 * The four codes above need no heuristic — they can only come from a response.
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
 * Exit code for a stop that was asked for: `SIGINT`, `SIGTERM`, an operator.
 */
const EXIT_CODE_GRACEFUL = 0;

/**
 * Exit code for a stop the process decided on because something was wrong.
 *
 * These were one constant, `0`, on the reasoning that `restart: unless-stopped`
 * recovers either way. It does — but it makes every deployment look identical to
 * every crash to anything reading exit codes, and a supervisor running
 * `on-failure` would not have restarted at all. Splitting them is what lets a
 * restart policy distinguish "the operator stopped it" from "it fell over",
 * without which the two are indistinguishable at the only place that can act.
 */
const EXIT_CODE_FATAL = 1;

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

/** What the process does about a failure it was handed. */
export type FailureDisposition = 'response_lifecycle' | 'survive' | 'fatal';

/**
 * What to do about an unhandled rejection: survive it.
 *
 * Always. A rejected promise is one piece of work that failed; the process
 * itself is in a defined state, because nothing unwound through it. That is the
 * inversion — the old policy terminated unless the failure was on a list, and
 * the list could not name everything that is merely a bad afternoon for one
 * request.
 *
 * Surviving is not the same as ignoring. Every rejection is logged, and every
 * one that is not a known per-request failure is counted by the tripwire, which
 * is what turns "this happened" into "this keeps happening" — the only evidence
 * that actually distinguishes a broken request from a broken process.
 */
export function classifyRejection(reason: unknown): FailureDisposition {
  return isResponseLifecycleError(reason) ? 'response_lifecycle' : 'survive';
}

/**
 * What to do about an uncaught exception: what we always did.
 *
 * The inversion stops here, and the asymmetry is the point rather than an
 * oversight. An exception unwound the stack through frames that had no say in
 * it, so anything half-written along the way stays half-written and the process
 * state is genuinely unknown. A rejection unwinds nothing. Terminating on the
 * first exception is the conservative reading, and it costs nothing that was
 * ever at stake here: the two incidents this work came from both arrived as
 * rejections.
 */
export function classifyException(reason: unknown): FailureDisposition {
  return isResponseLifecycleError(reason) ? 'response_lifecycle' : 'fatal';
}

/**
 * The process-wide repetition detector.
 *
 * Module scope rather than per-`main()`, because the thing it measures is a
 * property of the process.
 */
export const processFailureTripwire = new FailureTripwire({
  max: PROCESS_FAILURE_TRIPWIRE_MAX,
  windowMs: PROCESS_FAILURE_TRIPWIRE_WINDOW_MS,
  maxKinds: PROCESS_FAILURE_TRIPWIRE_MAX_KINDS,
});

/**
 * Boots and starts the application in the mode selected by the `--appmode=` CLI
 * argument (`API`, `DAEMON`, or both when omitted/unrecognized).
 *
 * Also installs every process-level handler: `SIGINT` and `SIGTERM` stop
 * whichever of the REST API / daemon were started and exit `0`; an uncaught
 * exception is fatal and exits `1`; an unhandled rejection is survived and
 * counted, and exits `1` only when the tripwire says the same failure keeps
 * repeating.
 *
 * @param options - LoopBack `ApplicationConfig` forwarded to `TwpapiApplication` when the API is started.
 * @returns Resolves once the selected component(s) have started; never resolves with a value.
 */
export async function main(options: ApplicationConfig = {}): Promise<void> {
  const logger = getLogger('app');

  let api: TwpapiApplication;
  let daemon: DaemonRunner;

  let shuttingDown = false;
  async function shutdown(exitCode: number) {
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
    logger.info({exitCode}, 'Shutting down');
    process.exit(exitCode);
  }

  /**
   * Starts a shutdown and does not wait for it.
   *
   * Returns `void` rather than the promise on purpose: every caller is a signal
   * handler or a failure handler, none of them can await, and handing them a
   * promise means each one has to remember not to drop it. The `catch` is here,
   * once, so there is nowhere left to forget it.
   */
  const beginShutdown = (exitCode: number): void => {
    shutdown(exitCode).catch(err => logger.error({err}, 'Shutdown failed'));
  };

  /** Logs a failure that affects one request and leaves the process alone. */
  const logResponseLifecycleError = (kind: string, reason: unknown) => {
    logger.warn(
      {event: 'response_lifecycle_error', kind, err: reason as Error},
      'Response lifecycle error; request abandoned, process continues',
    );
  };

  /**
   * Handles an unhandled rejection: survive it, and count it.
   *
   * This is where the policy inverted. Every rejection is survived, because one
   * rejected promise is one failed piece of work and not a compromised process —
   * and because the previous rule, "terminate unless the code is on a list",
   * made an unauthenticated request against a down database into a way to stop
   * the service.
   *
   * The tripwire is what keeps that from being a licence to ignore failures.
   * The same kind repeating past its allowance inside a window is the evidence a
   * single occurrence cannot give: not one request went wrong, but the process
   * keeps going wrong the same way. That is worth restarting for, and worth
   * paging for — an exit code 1 here should reach somebody, not just the
   * supervisor.
   */
  const handleRejection = (reason: unknown) => {
    if (classifyRejection(reason) === 'response_lifecycle') {
      logResponseLifecycleError('unhandledRejection', reason);
      return;
    }
    const kind = failureKind(reason);
    if (!processFailureTripwire.record(reason)) {
      logger.error(
        {event: 'unhandledRejection', failureKind: kind, err: reason as Error},
        'Unhandled rejection; request abandoned, process continues',
      );
      return;
    }
    logger.fatal(
      {
        event: 'failure_tripwire',
        failureKind: kind,
        threshold: PROCESS_FAILURE_TRIPWIRE_MAX,
        windowMs: PROCESS_FAILURE_TRIPWIRE_WINDOW_MS,
        err: reason as Error,
      },
      'The same failure keeps repeating; the process is degraded',
    );
    beginShutdown(EXIT_CODE_FATAL);
  };

  /** Handles an uncaught exception, which is fatal exactly as it always was. */
  const handleException = (reason: unknown) => {
    if (classifyException(reason) === 'response_lifecycle') {
      logResponseLifecycleError('uncaughtException', reason);
      return;
    }
    logger.fatal({event: 'uncaughtException', err: reason as Error}, 'Fatal error');
    beginShutdown(EXIT_CODE_FATAL);
  };

  //catches ctrl+c event
  process.on('SIGINT', () => beginShutdown(EXIT_CODE_GRACEFUL));
  process.on('SIGTERM', () => beginShutdown(EXIT_CODE_GRACEFUL));

  //catches uncaught exceptions
  process.on('uncaughtException', handleException);

  // Without this listener Node treats an unhandled rejection as fatal.
  process.on('unhandledRejection', handleRejection);

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
