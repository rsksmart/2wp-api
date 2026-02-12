import type {ApplicationConfig} from '@loopback/core';
import {BootMixin} from '@loopback/boot';
import {RepositoryMixin} from '@loopback/repository';
import {RestApplication, RestMiddlewareGroups} from '@loopback/rest';
import {
  RestExplorerBindings,
  RestExplorerComponent,
} from '@loopback/rest-explorer';
import {ServiceMixin} from '@loopback/service-proxy';
import path from 'node:path';
import {DependencyInjectionHandler} from './dependency-injection-handler';
import {MySequence} from './sequence';
import { ENVIRONMENT_PRODUCTION } from './constants';
import {requestSecurityMiddleware} from './middleware/request-security.middleware';

export {ApplicationConfig} from '@loopback/core';

export class TwpapiApplication extends BootMixin(ServiceMixin(RepositoryMixin(RestApplication))) {
  constructor(options: ApplicationConfig = {}) {
    const appOptions: ApplicationConfig = {
      ...options,
      rest: {
        cors: {
          origin: ['https://powpeg.staging-testnet.rootstock.io'],
          methods: ['GET', 'POST'],
          allowedHeaders: ['Content-Type', 'api_key', 'x-payload-hash'],
          credentials: true,
          maxAge: 86400,
        },
      },
    };
    super(appOptions);

    // Set up the custom sequence
    this.sequence(MySequence);

    this.middleware(requestSecurityMiddleware, {
      group: 'requestSecurity',
      upstreamGroups: RestMiddlewareGroups.PARSE_PARAMS,
      downstreamGroups: RestMiddlewareGroups.INVOKE_METHOD,
    });

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
