import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {Request, Response, RestApplication, RestBindings} from '@loopback/rest';
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
import { ENVIRONMENT_PRODUCTION } from './constants';

export {ApplicationConfig};

/**
 * Applies the request-body and validation budgets to the REST server, unless the
 * caller already configured its own body parsers.
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
  const limit = MAX_REQUEST_BODY_BYTES;
  const rest = options.rest ?? {};
  if (rest.requestBodyParser) {
    return options;
  }
  return {
    ...options,
    rest: {
      ...rest,
      requestBodyParser: {
        limit,
        json: {limit, inflate: false},
        text: {limit, inflate: false},
        urlencoded: {limit, inflate: false},
        raw: {limit, inflate: false},
        validation: {
          ajvFactory: boundedAjvFactory,
          ajvErrorTransformer: truncateValidationErrors,
        },
      },
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

    // Log inbound HTTP requests/responses for API routes
    this.middleware(httpAccessLogMiddleware);

    // Convert every downstream failure into a bounded JSON error body. Also
    // replaces the framework reject action below, so no error path can reach
    // strong-error-handler's XML/HTML serializers.
    this.middleware(boundedErrorWriterMiddleware);

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
