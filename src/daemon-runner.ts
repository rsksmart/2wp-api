import {Application} from '@loopback/core';
import {ServicesBindings} from './dependency-injection-bindings';
import {DependencyInjectionHandler} from './dependency-injection-handler';
import {DaemonService} from './services/daemon.service';
import {assertNetworkConfigured} from './models/atlas/atlas-chain';

export class DaemonRunner extends Application {
  daemonService: DaemonService;

  constructor() {
    super();
    assertNetworkConfigured();

    DependencyInjectionHandler.configureDependencies(this);
    // Daemon-only bindings, the Atlas event publisher among them: emitting
    // events is a responsibility of this process and of no other.
    DependencyInjectionHandler.configureDaemonDependencies(this);
  }

  async start(): Promise<void> {
    await super.start();
    this.daemonService = await this.get(ServicesBindings.DAEMON_SERVICE);
    await this.daemonService.start();
  }

  async stop(): Promise<void> {
    await this.daemonService.stop();
  }
}
