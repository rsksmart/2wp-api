import {MiddlewareContext, RestBindings, RestRouter} from '@loopback/rest';

/**
 * The route a request resolves to, as a template, or `undefined` when it does
 * not resolve to one.
 *
 * Asking the router instead of reading `request.path` is what makes anything
 * keyed on the route immune to spelling. The router accepts `/utxo` and `/utxo/`
 * for the same route, so anything keyed on the text the client sent files one
 * route under two keys — and, for a path with parameters, under one key per
 * value. Enumerating variants only covers the ones somebody thought of; asking
 * the component that routes covers the ones nobody did.
 *
 * The two router shapes disagree about how to say "no route": `RestRouter.find`
 * answers `undefined`, `RoutingTable.find` throws `NotFound`. Both collapse to
 * `undefined` here — the 404 is the router's business, not the caller's.
 *
 * Never throws: a label lookup must not be able to fail the request it labels.
 *
 * @param ctx - The middleware context for this request.
 * @returns The route template, or `undefined` if the request resolves to no route.
 */
export async function resolveRouteTemplate(
  ctx: MiddlewareContext,
): Promise<string | undefined> {
  try {
    const router = await ctx.get<RestRouter>(RestBindings.ROUTER, {
      optional: true,
    });
    return router?.find(ctx.request)?.path;
  } catch {
    return undefined;
  }
}
