import {Next} from '@loopback/core';
import {Middleware, MiddlewareContext} from '@loopback/rest';
import {MAX_REQUEST_BODY_BYTES} from '../config/resource-budgets';
import {budgetExceededError, ResourceBudgetName} from '../utils/resource-budget';

/**
 * Rejects oversized request bodies from the declared `Content-Length`, before
 * any of it is buffered.
 *
 * This is the cheap first line: it costs one header read and never touches the
 * socket payload. The body-parser `limit` configured in `application.ts` remains
 * the backstop for requests that omit `Content-Length` (chunked transfers) or
 * understate it, but that path has to read bytes to notice. Rejecting here also
 * gives the budget a structured observability signal, which body-parser's own
 * 413 would not.
 */
export const requestBodyBudgetMiddleware: Middleware = async (
  ctx: MiddlewareContext,
  next: Next,
) => {
  const declared = Number(ctx.request.headers['content-length']);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) {
    throw budgetExceededError({
      resource: ResourceBudgetName.REQUEST_BODY_BYTES,
      configuredLimit: MAX_REQUEST_BODY_BYTES,
      observedValue: declared,
      route: `${ctx.request.method} ${ctx.request.path}`,
    });
  }
  return next();
};
