import {AsyncLocalStorage} from 'async_hooks';

interface TraceStore {
  traceId: string;
}

const traceContext = new AsyncLocalStorage<TraceStore>();

// Run a callback within a trace context so every log emitted downstream
// (controllers, services, async continuations) can pick up the traceId.
export const runWithTraceId = <T>(traceId: string, callback: () => T): T =>
  traceContext.run({traceId}, callback);

export const getTraceId = (): string | undefined =>
  traceContext.getStore()?.traceId;
