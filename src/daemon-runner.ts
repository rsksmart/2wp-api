import {DaemonService} from './services/daemon.service';
import {NodeBridgeDataProvider} from './services/node-bridge-data.provider';
import {PeginStatusMongoDbDataService} from './services/pegin-status-data-services/peg-status.mongodb.service';

export class DaemonRunner {
  daemonService: DaemonService;

  constructor() {
    const MONGO_DB_URI = `mongodb://${process.env.RSK_DB_USER}:${process.env.RSK_DB_PASS}@${process.env.RSK_DB_URL}:${process.env.RSK_DB_PORT}/${process.env.RSK_DB_NAME}`;
    // TODO: The provider should be injected
    this.daemonService = new DaemonService(
      new NodeBridgeDataProvider(),
      new PeginStatusMongoDbDataService(MONGO_DB_URI) // TODO: user/pass should be defined by env vars
    );
  }

  start(): Promise<void> {
    return this.daemonService.start();
  }

  stop(): Promise<void> {
    return this.daemonService.stop();
  }
}
