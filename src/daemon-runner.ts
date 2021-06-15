import {DaemonService} from './services/daemon.service';
import {NodeBridgeDataProvider} from './services/node-bridge-data.provider';
import {PeginStatusDataServiceMemoryImplementation} from './services/pegin-status-data.service';

export class DaemonRunner {
  daemonService: DaemonService;

  constructor() {
    // TODO: The provider should be injected
    this.daemonService = new DaemonService(
      new NodeBridgeDataProvider(),
      new PeginStatusDataServiceMemoryImplementation()
    );
  }

  start(): void {
    this.daemonService.start();
  }

  stop(): void {
    this.daemonService.stop();
  }
}
