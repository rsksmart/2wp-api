import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {
  Request,
  Response,
  RestApplication,
  RestBindings,
  TrieRouter,
} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import {MAX_REQUEST_BODY_BYTES} from './config/resource-budgets';
import {
  boundedAjvFactory,
  truncateValidationErrors,
} from './validation/bounded-ajv.factory';
import {DependencyInjectionHandler} from './dependency-injection-handler';
import {MySequence} from './sequence';
import {httpAccessLogMiddleware} from './middleware/http-access-log.middleware';
import {requestBodyBudgetMiddleware} from './middleware/request-body-budget.middleware';
import {
  boundedErrorWriterMiddleware,
  writeBoundedError,
} from './middleware/bounded-error-writer';
import {connectionOutputBudgetMiddleware} from './middleware/connection-output-budget.middleware';
import {rateLimitMiddleware} from './middleware/rate-limit.middleware';
import {getLogger} from './utils/logger';
import { ENVIRONMENT_PRODUCTION } from './constants';

export {ApplicationConfig};

const logger = getLogger('application');

/** Loose view of LoopBack's parser options, which are an open key space. */
type ParserOptions = Record<string, unknown>;

/**
 * Parsers that read the request body, and can therefore construct a
 * decompression stream.
 *
 * `stream` is deliberately absent: it hands the raw stream to the controller
 * without reading it, so there is no decompressor to disable and nothing here to
 * decide about it.
 */
const BODY_READING_PARSERS = ['json', 'text', 'urlencoded', 'raw'] as const;

/**
 * The body-size budget, honouring a caller value only when it is stricter.
 *
 * body-parser also accepts a size string (`'1mb'`), which cannot be compared
 * against the budget without parsing it. An unparsed value is discarded in
 * favour of the budget rather than trusted: failing closed costs a caller its
 * stricter `'64kb'`, while trusting it could cost the budget entirely.
 *
 * @param callerLimit - Whatever the caller put in this `limit` slot.
 * @param where - Which slot, for the log line.
 * @returns A byte count no larger than `MAX_REQUEST_BODY_BYTES`.
 */
function cappedLimit(callerLimit: unknown, where: string): number {
  if (typeof callerLimit === 'number' && Number.isFinite(callerLimit)) {
    return Math.min(callerLimit, MAX_REQUEST_BODY_BYTES);
  }
  if (callerLimit !== undefined) {
    logger.warn(
      {method: 'withResourceBudgets', where, callerLimit},
      'Ignoring a non-numeric body-parser limit; applying the configured budget',
    );
  }
  return MAX_REQUEST_BODY_BYTES;
}

/**
 * Applies the request-body and validation budgets to the REST server.
 *
 * The caller's own body-parser configuration is honoured, and then the budgets
 * are applied over it. That order is the point: these are not defaults that a
 * caller may replace, they are controls. What a caller may still decide is
 * everything else — media types, per-parser options, a *stricter* limit, and any
 * parser this function does not govern.
 *
 * This function used to return the caller's options untouched whenever they
 * carried any `requestBodyParser` at all, which dropped all three controls at
 * once. Nothing supplied that config, so no test exercised the branch: the suite
 * stayed green with the Brotli decoder one line away from being reachable again.
 *
 * Two things are wired here:
 *
 * - **Body size.** `body-parser` answers an over-limit request with a bounded 413
 *   instead of buffering it, which is the backstop behind
 *   `requestBodyBudgetMiddleware`.
 * - **Validation error generation.** `ajvFactory` replaces LoopBack's factory
 *   with one that stops at the first schema failure, and `ajvErrorTransformer`
 *   caps whatever survives. Without this, Ajv retains one error object per
 *   invalid array item — tens of MB of heap for a single request, which is the
 *   allocation a malformed-payload denial of service relies on.
 * - **Request-body encodings.** `inflate: false` restricts bodies to `identity`.
 *   body-parser checks this *before* constructing a decompression stream, so no
 *   zlib or Brotli decoder is reachable from a public route; every other
 *   encoding becomes a bounded 415. This is deliberately not configurable —
 *   the flag is all-or-nothing, so re-enabling gzip would re-enable Brotli with
 *   it. Since nothing may be compressed, wire size equals decoded size and the
 *   body limit above bounds both.
 *
 * @param options - The application config supplied by the caller.
 * @returns The config with `rest.requestBodyParser` filled in.
 */
export function withResourceBudgets(
  options: ApplicationConfig,
): ApplicationConfig {
  const rest = options.rest ?? {};
  const caller = (rest.requestBodyParser ?? {}) as ParserOptions;

  // The caller's keys come first, so anything this function does not govern —
  // `stream`, or whatever LoopBack adds next — survives untouched.
  //
  // `inflate: false` is applied here as well as per parser, and that is not
  // belt-and-braces. `getParserOptions` in `@loopback/rest` ends with
  // `Object.assign(opts, options[type], options)` — the top-level object is
  // applied *after* the per-parser one, so a single top-level `inflate: true`
  // re-enabled decompression for every parser at once and defeated the control
  // completely. Both positions have to be closed, because either one alone is
  // the whole protection.
  const requestBodyParser: ParserOptions = {
    ...caller,
    limit: cappedLimit(caller.limit, 'limit'),
    inflate: false,
  };

  BODY_READING_PARSERS.forEach(name => {
    const callerParser = (caller[name] ?? {}) as ParserOptions;
    // `inflate` sits after the spread on purpose: that is what makes it
    // non-negotiable rather than a default.
    requestBodyParser[name] = {
      ...callerParser,
      limit: cappedLimit(callerParser.limit, name),
      inflate: false,
    };
  });

  requestBodyParser.validation = {
    ...((caller.validation ?? {}) as ParserOptions),
    ajvFactory: boundedAjvFactory,
    ajvErrorTransformer: truncateValidationErrors,
  };

  return {
    ...options,
    rest: {
      ...rest,
      requestBodyParser:
        requestBodyParser as typeof rest.requestBodyParser,
    },
  };
}

/**
 * The 2wp-api REST application: a LoopBack 4 `RestApplication` with booting,
 * repository, and datasource-proxy mixins applied. Boots every `.controller.js`
 * file found recursively under `controllers/` (`nested: true`), serves
 * `public/` as the home page, logs inbound HTTP requests/responses, and
 * (outside `NODE_ENV=production`) exposes the `/explorer` REST Explorer UI.
 * See `docs/setup.md` and `docs/api.md`.
 */
export class TwpapiApplication extends BootMixin(ServiceMixin(RepositoryMixin(RestApplication))) {
  /**
   * @param options - LoopBack `ApplicationConfig` (e.g. `rest.port`, `rest.host`) passed through to `RestApplication`.
   */
  constructor(options: ApplicationConfig = {}) {
    super(withResourceBudgets(options));

    // Set up the custom sequence
    this.sequence(MySequence);

    // Bind the router explicitly so middleware can ask the component that
    // actually routes which route a request resolves to. When this binding is
    // absent the server builds an equivalent router privately, and a private
    // router is invisible to the rate limiter — which then has to guess the
    // route from the request path, and guesses wrong for every spelling it did
    // not enumerate. Constructed with whatever router options the caller
    // configured, so this stays a wiring change and not a behaviour change.
    this.bind(RestBindings.ROUTER).to(new TrieRouter(options.rest?.router));

    // Log inbound HTTP requests/responses for API routes
    this.middleware(httpAccessLogMiddleware);

    // Convert every downstream failure into a bounded JSON error body. Also
    // replaces the framework reject action below, so no error path can reach
    // strong-error-handler's XML/HTML serializers.
    this.middleware(boundedErrorWriterMiddleware);

    // Refuse a client that is over its allowance. The cheapest possible
    // rejection — one header read and a map lookup — and deliberately ahead of
    // the body budget, so an over-limit client's payload is never buffered.
    this.middleware(rateLimitMiddleware);

    // Reject oversized bodies on the declared Content-Length, before the
    // body parsers buffer anything. Registered after the access log so the
    // rejection is still correlated by traceId.
    this.middleware(requestBodyBudgetMiddleware);

    // Drop connections whose peer has stopped reading, so pipelined responses
    // cannot accumulate in the process.
    this.middleware(connectionOutputBudgetMiddleware);

    // The landing page is served by HomePageController, not by serve-static.
    // serve-static resolves a directory request without a trailing slash from
    // an fs.stat callback that can outlive the response and then set headers on
    // it, throwing from inside the library where nothing can catch it.

    // For production environments we will not load the explorer component
    if (process.env.NODE_ENV !== ENVIRONMENT_PRODUCTION) {
      // Customize @loopback/rest-explorer configuration here
      this.configure(RestExplorerBindings.COMPONENT).to({
        path: '/explorer',
      });
      this.component(RestExplorerComponent);
    }

    this.projectRoot = __dirname;
    // Customize @loopback/boot Booter Conventions here
    this.bootOptions = {
      controllers: {
        // Customize ControllerBooter Conventions here
        dirs: ['controllers'],
        extensions: ['.controller.js'],
        nested: true,
      },
    };

    // Errors raised outside the middleware chain (e.g. by the framework's own
    // parameter parsing) still land on the reject action, so bound that too.
    this.bind(RestBindings.SequenceActions.REJECT).to(
      (ctx: {request: Request; response: Response}, err: Error) => {
        writeBoundedError(ctx.request, ctx.response, err);
      },
    );

    DependencyInjectionHandler.configureDependencies(this);
  }

}
