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

    const corsOrigins =
      process.env.CORS_ORIGIN && process.env.CORS_ORIGIN.trim().length > 0
        ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(origin => origin.length > 0)
        : ['https://powpeg.staging-testnet.rootstock.io'];

    if(corsOrigins.length === 0) {
      throw new Error('CORS_ORIGIN environment variable is set but does not contain any valid origins');
    }

    if(corsOrigins.includes("*")) {
      throw new Error('CORS_ORIGIN environment variable cannot contain wildcard origin "*" for security reasons');
    }

    const appOptions: ApplicationConfig = {
      ...options,
      rest: {
        cors: {
          origin: [corsOrigins],
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
