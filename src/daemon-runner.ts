import {MongoDbDataSource} from './datasources/mongodb.datasource';
import {Block} from './models/rsk/block.model';
import {DaemonService} from './services/daemon.service';
import {NodeBridgeDataProvider} from './services/node-bridge-data.provider';
import {PeginStatusMongoDbDataService} from './services/pegin-status-data-services/peg-status.mongodb.service';
import {RskChainSyncService} from './services/rsk-chain-sync.service';
import {RskNodeService} from './services/rsk-node.service';
import {SyncStatusDataService} from './services/sync-status-data.service';
import {SyncStatusMongoService} from './services/sync-status-mongo.service';

export class DaemonRunner {
  daemonService: DaemonService;
  mongoDbDatasource: MongoDbDataSource;

  constructor() {
    const MONGO_DB_URI = `mongodb://${process.env.RSK_DB_USER}:${process.env.RSK_DB_PASS}@${process.env.RSK_DB_URL}:${process.env.RSK_DB_PORT}/${process.env.RSK_DB_NAME}`;
    // TODO: The provider should be injected
    this.mongoDbDatasource = new MongoDbDataSource(MONGO_DB_URI);
    let syncStatusMongoService: SyncStatusDataService = new SyncStatusMongoService(this.mongoDbDatasource);
    let defaultInitialBlock = new Block(
      1930363,
      '0x6311d47c3b696e33b5ef8b19665c092d0cf44505d8e500a96ee50b8eddecd092',
      '0x5ffe1faf3ecc07484b47805b13a94be6b43b4d29d8bb7b8c4173eeb9cc86e579'
    );
    this.daemonService = new DaemonService(
      new NodeBridgeDataProvider(),
      new PeginStatusMongoDbDataService(MONGO_DB_URI),
      new RskChainSyncService(syncStatusMongoService, new RskNodeService(), defaultInitialBlock)
    );
  }

  async start(): Promise<void> {
    await this.daemonService.start();
    await this.mongoDbDatasource.connect();
  }

  async stop(): Promise<void> {
    await this.daemonService.stop();
    await this.mongoDbDatasource.disconnect();
  }
}
