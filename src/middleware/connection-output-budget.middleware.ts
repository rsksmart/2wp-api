import {Next} from '@loopback/core';
import {Middleware, MiddlewareContext} from '@loopback/rest';
import {MAX_CONNECTION_BUFFERED_BYTES} from '../config/resource-budgets';
import {getLogger} from '../utils/logger';
import {recordBudgetViolation, ResourceBudgetName} from '../utils/resource-budget';

const logger = getLogger('connection-output-budget');

/**
 * Drops a connection whose peer has stopped reading and whose unflushed
 * responses have grown past `MAX_CONNECTION_BUFFERED_BYTES`.
 *
 * Per-response budgets bound one answer; they do nothing about a client that
 * pipelines many requests on one socket and then never reads. HTTP/1.1 response
 * ordering means every completed response has to stay in the process until the
 * earlier ones drain, so N pipelined requests retain N responses at once. That
 * is what multiplies a bounded per-response cost back into an unbounded one.
 *
 * `socket.writableLength` is what Node has accepted but not yet handed to the
 * kernel — it only grows when the peer is not draining. A client that reads
 * normally sits near zero regardless of how much it requests, so a generous
 * budget here cannot penalise a slow-but-reading consumer.
 *
 * @param ctx - Middleware context.
 * @param next - Downstream chain, skipped when the connection is dropped.
 * @returns The downstream result, or nothing when the connection was dropped.
 */
export const connectionOutputBudgetMiddleware: Middleware = async (
  ctx: MiddlewareContext,
  next: Next,
) => {
  const {socket} = ctx.response;
  const buffered = socket?.writableLength;

  if (
    typeof buffered === 'number' &&
    buffered > MAX_CONNECTION_BUFFERED_BYTES
  ) {
    recordBudgetViolation({
      resource: ResourceBudgetName.CONNECTION_BUFFERED_BYTES,
      configuredLimit: MAX_CONNECTION_BUFFERED_BYTES,
      observedValue: buffered,
      route: `${ctx.request.method} ${ctx.request.path}`,
      detail: 'peer is not draining its responses',
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
    socket?.destroy();
    return undefined;
  }

  return next();
};
