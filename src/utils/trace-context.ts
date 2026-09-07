import {AsyncLocalStorage} from 'async_hooks';

/** Per-request state that every layer downstream can read without being handed it. */
export interface RequestStore {
  /** Correlation id for every log line emitted during this request. */
  traceId: string;
  /**
   * Trips when the client goes away or the request outlives its deadline.
   * Absent for work with no request behind it, such as the daemon's block sync.
   */
  signal?: AbortSignal;
  /**
   * The federation addresses resolved for this request, memoized.
   *
   * The promise rather than the resolved value, so two lookups that start
   * concurrently inside one request share the call in flight instead of each
   * issuing its own. Resolving the federation address is an `eth_call` to the RSK
   * node, and the caller asks once per output of an attacker-chosen Bitcoin
   * transaction.
   *
   * A named field rather than a general-purpose memo map. An untyped
   * `Map<string, unknown>` here would be more reusable and would invite anything
   * at all, keyed by unbounded strings — the same reason `RateLimitRouteClass` is
   * a closed vocabulary. A second candidate gets a second field, and only then is
   * it worth asking whether the pattern deserves an abstraction.
   */
  federationAddresses?: Promise<ReadonlySet<string>>;
}

const requestContext = new AsyncLocalStorage<RequestStore>();

/**
 * Runs a callback inside a request context, so everything downstream —
 * controllers, services, and async continuations across `await` boundaries —
 * can read the traceId and the cancellation signal without them being threaded
 * through every signature.
 *
 * This matters for the signal specifically: the provider services are
 * module-scope singletons shared by every concurrent request, so per-request
 * state cannot live on them.
 *
 * @param store - The request-scoped state.
 * @param callback - Work to run inside the context.
 * @returns Whatever `callback` returns.
 */
export const runWithRequestContext = <T>(
  store: RequestStore,
  callback: () => T,
): T => requestContext.run(store, callback);

/**
 * Runs a callback inside a request context carrying only a traceId.
 *
 * @param traceId - Correlation id.
 * @param callback - Work to run inside the context.
 * @returns Whatever `callback` returns.
 */
export const runWithTraceId = <T>(traceId: string, callback: () => T): T =>
  runWithRequestContext({traceId}, callback);

/**
 * The current request's correlation id.
 *
 * @returns The traceId, or `undefined` outside a request context.
 */
export const getTraceId = (): string | undefined =>
  requestContext.getStore()?.traceId;

/**
 * The current request's cancellation signal.
 *
 * @returns The signal, or `undefined` when there is no request behind this work.
 */
export const getRequestSignal = (): AbortSignal | undefined =>
  requestContext.getStore()?.signal;

/**
 * The current request's whole store.
 *
 * The other accessors return a field; this returns the object, because
 * per-request memoization has to *write* to it. Callers must tolerate
 * `undefined`: the daemon and any direct caller run with no request behind them.
 *
 * @returns The store, or `undefined` outside a request context.
 */
export const getRequestStore = (): RequestStore | undefined =>
  requestContext.getStore();
