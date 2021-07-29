import {Application} from '@loopback/core';
import {ServicesBindings} from './dependency-injection-bindings';
import {DependencyInjectionHandler} from './dependency-injection-handler';
import {DaemonService} from './services/daemon.service';

export class DaemonRunner extends Application {
  daemonService: DaemonService;

  constructor() {
    super();

    DependencyInjectionHandler.configureDependencies(this);
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
