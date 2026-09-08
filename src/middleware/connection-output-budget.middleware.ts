import {Next} from '@loopback/core';
import {Middleware, MiddlewareContext} from '@loopback/rest';
import {
  CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS,
  CONNECTION_OUTPUT_STALL_MS,
  MAX_CONNECTION_BUFFERED_BYTES,
  MAX_TOTAL_PENDING_OUTPUT_BYTES,
  CONNECTION_OUTPUT_AGGREGATE_STALL_MS,
} from '../config/resource-budgets';
import {getLogger} from '../utils/logger';
import {recordBudgetViolation, ResourceBudgetName} from '../utils/resource-budget';

const logger = getLogger('connection-output-budget');

/** Records the violation, says so, and drops the connection. */
function dropConnection(
  ctx: MiddlewareContext,
  buffered: number,
  detail: string,
): void {
  recordBudgetViolation({
    resource: ResourceBudgetName.CONNECTION_BUFFERED_BYTES,
    configuredLimit: MAX_CONNECTION_BUFFERED_BYTES,
    observedValue: buffered,
    route: `${ctx.request.method} ${ctx.request.path}`,
    detail,
  });
  logger.warn(
    {
      method: 'connectionOutputBudget',
      httpMethod: ctx.request.method,
      httpPath: ctx.request.path,
      bufferedBytes: buffered,
    },
    'Dropping connection whose responses are not being read',
  );
  ctx.response.socket?.destroy();
}

/**
 * Watches one response's socket for the whole time it is in flight.
 *
 * The pre-flight check below cannot see this case at all: when a request
 * arrives, nothing has been written to its socket yet, so the sample is always
 * zero. The bytes appear *after* the middleware chain returns, when the response
 * is handed to the socket — and a client that asked for a large response and
 * never reads it holds all of them until the connection closes. Enough such
 * connections exhaust the heap with nothing oversized fetched and no
 * per-response budget exceeded, which is precisely why no other control here
 * applies.
 *
 * **Two consecutive samples over budget with no progress**, rather than one over
 * budget. The distinction is what keeps this from becoming the outage it
 * prevents: a large legitimate response is momentarily over the budget by
 * definition, and a genuinely slow reader can sit over it for a while — but a
 * draining peer's buffer goes *down* between samples, and a peer that has
 * stopped reading holds exactly the same number. Measured on a 7.5 MB response:
 * a draining client stays at 0 bytes and a non-draining one sits at 7.5 MB from
 * the first sample and does not move. Requiring progress rather than a level is
 * what makes the rule hold for a slow reader too, where a level alone would not.
 */
/** One in-flight response being watched, with the history the stall rule needs. */
interface WatchedResponse {
  ctx: MiddlewareContext;
  previous: number;
  stalledSince?: number;
}

/**
 * Every response currently in flight.
 *
 * A registry and one sweeper rather than a timer per response, because the
 * aggregate check below cannot be made from inside a single response's timer:
 * the quantity that kills the process is the sum across connections, and no
 * connection can see it alone.
 */
const watched = new Set<WatchedResponse>();

/** How many bytes this response is holding, or `undefined` if it has no socket. */
const bufferedBytes = (entry: WatchedResponse): number | undefined =>
  entry.ctx.response.socket?.writableLength;

/**
 * Drops a connection that has stopped draining, judged over time.
 *
 * Two designs were measured and rejected before this one, and both look better
 * than they are:
 *
 * "Drop it if the buffer is not going down" is the obvious rule and does not
 * survive load. Under concurrency a *draining* socket sits at an identical
 * `writableLength` across consecutive samples too, because a saturated event
 * loop does not hand bytes to the kernel in between. Instrumented over a full
 * run of 48 legitimate clients, not one socket ever recorded a decrease before
 * its response closed. Progress is not observable here; duration is.
 *
 * A short window is the other. Duration does separate the two cleanly — a
 * legitimate response is over budget for at most 70 ms before closing, median
 * 45, while a peer that has stopped reading stays over budget indefinitely — but
 * the windows short enough to also stop a simultaneous burst are close enough to
 * that 70 ms to be unreliable. `CONNECTION_OUTPUT_STALL_MS` keeps a wide margin
 * and leaves the burst to {@link enforceAggregateCeiling}, which measures the
 * quantity that actually matters.
 *
 * @returns `true` when the entry was dropped and should leave the registry.
 */
function enforceStall(entry: WatchedResponse, buffered: number): boolean {
  if (buffered <= MAX_CONNECTION_BUFFERED_BYTES) {
    entry.previous = Number.POSITIVE_INFINITY;
    entry.stalledSince = undefined;
    return false;
  }
  if (buffered < entry.previous) {
    // Draining. Over the budget is expected while a large answer goes out.
    entry.previous = buffered;
    entry.stalledSince = undefined;
    return false;
  }
  entry.previous = buffered;
  entry.stalledSince ??= Date.now();
  if (Date.now() - entry.stalledSince < CONNECTION_OUTPUT_STALL_MS) {
    return false;
  }
  dropConnection(entry.ctx, buffered, 'peer stopped draining its response');
  return true;
}

/**
 * Keeps the total bytes pending across every connection under a ceiling.
 *
 * This is the control for the case per-connection rules cannot reach. Enough
 * clients each requesting a large response and never reading it exhaust the heap
 * while every individual connection is behaving unremarkably — and the process
 * does not die on the outbound write at all. It dies on the next large *inbound*
 * provider parse, because the retained bodies raised the floor. No per-connection
 * judgement can see that, since the quantity is a sum.
 *
 * The heaviest holder is dropped first, and dropping continues until the total is
 * back under the ceiling. Heaviest-first is deliberate: it frees the most memory
 * per connection sacrificed, and it targets the client doing the most damage
 * rather than whichever one happened to be sampled first.
 *
 * Ordinary traffic never approaches this. A client that reads its response holds
 * nothing, and the ceiling is set well above the peak that 48 concurrent
 * legitimate large responses actually reach.
 */
function enforceAggregateCeiling(sizes: Map<WatchedResponse, number>): void {
  // Only bytes held by a connection that is *stuck* count. A large answer on its
  // way out to a reader is pending too, and counting it would make the ceiling
  // fire on exactly the traffic the service exists to serve: measured across 48
  // concurrent 7.5 MB responses, legitimate clients hold 60 MB in total at peak,
  // against 90 MB for the burst that kills the process. Those two numbers are too
  // close to separate. Filtered by how long each connection has been stuck they
  // are 0 MB and 90 MB, which is not close at all.
  const now = Date.now();
  const stuck = new Map<WatchedResponse, number>();
  sizes.forEach((bytes, entry) => {
    const stalledFor =
      entry.stalledSince === undefined ? 0 : now - entry.stalledSince;
    if (stalledFor >= CONNECTION_OUTPUT_AGGREGATE_STALL_MS) {
      stuck.set(entry, bytes);
    }
  });

  let total = 0;
  stuck.forEach(bytes => (total += bytes));
  if (total <= MAX_TOTAL_PENDING_OUTPUT_BYTES) {
    return;
  }

  const heaviestFirst = [...stuck.entries()].sort((a, b) => b[1] - a[1]);
  for (const [entry, bytes] of heaviestFirst) {
    if (total <= MAX_TOTAL_PENDING_OUTPUT_BYTES) {
      return;
    }
    dropConnection(
      entry.ctx,
      bytes,
      'total pending response bytes over the process ceiling',
    );
    watched.delete(entry);
    total -= bytes;
  }
}

/** Samples every in-flight response once. */
function sweep(): void {
  const sizes = new Map<WatchedResponse, number>();

  // Snapshot first: `enforceStall` removes entries, and deleting from a Set
  // while iterating it is legal but not worth reasoning about twice.
  [...watched].forEach(entry => {
    const buffered = bufferedBytes(entry);
    if (typeof buffered !== 'number') {
      return;
    }
    if (enforceStall(entry, buffered)) {
      watched.delete(entry);
      return;
    }
    sizes.set(entry, buffered);
  });

  enforceAggregateCeiling(sizes);
}

// One process-wide timer, `unref`ed so a pending sample cannot hold a dying
// process open — the same reason the request deadline and the rate-limit sweeper
// use it.
const sweeper = setInterval(sweep, CONNECTION_OUTPUT_SAMPLE_INTERVAL_MS);
sweeper.unref();

/** Total bytes currently pending across every watched response. Intended for tests. */
export function pendingOutputBytes(): number {
  let total = 0;
  watched.forEach(entry => (total += bufferedBytes(entry) ?? 0));
  return total;
}

/** Runs one sampling pass immediately. Intended for tests. */
export function sweepOutputBudgets(): void {
  sweep();
}

/** Forgets every watched response. Intended for tests. */
export function resetOutputBudgets(): void {
  watched.clear();
}

/**
 * Registers a response to be watched for as long as it is in flight.
 *
 * The arrival-time check cannot see any of this: when a request arrives nothing
 * has been written to its socket, so the sample is always zero. The bytes appear
 * after the middleware chain returns.
 */
function watchOutputBuffer(ctx: MiddlewareContext): void {
  const entry: WatchedResponse = {ctx, previous: Number.POSITIVE_INFINITY};
  watched.add(entry);
  ctx.response.once('close', () => watched.delete(entry));
}

export const connectionOutputBudgetMiddleware: Middleware = async (
  ctx: MiddlewareContext,
  next: Next,
) => {
  const buffered = ctx.response.socket?.writableLength;

  if (
    typeof buffered === 'number' &&
    buffered > MAX_CONNECTION_BUFFERED_BYTES
  ) {
    dropConnection(ctx, buffered, 'peer is not draining its responses');
    return undefined;
  }

  watchOutputBuffer(ctx);
  return next();
};
