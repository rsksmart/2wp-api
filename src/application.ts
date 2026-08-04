import {BootMixin} from '@loopback/boot';
import {ApplicationConfig} from '@loopback/core';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import path from 'path';
import {DependencyInjectionHandler} from './dependency-injection-handler';
import {MySequence} from './sequence';
import {httpAccessLogMiddleware} from './middleware/http-access-log.middleware';
import { ENVIRONMENT_PRODUCTION } from './constants';

export {ApplicationConfig};

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
    super(options);

    // Set up the custom sequence
    this.sequence(MySequence);

    // Log inbound HTTP requests/responses for API routes
    this.middleware(httpAccessLogMiddleware);

    // Set up default home page
    this.static('/', path.join(__dirname, '../public'));

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

    DependencyInjectionHandler.configureDependencies(this);
  }

}
