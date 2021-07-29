import {MongoDbDataSource} from './datasources/mongodb.datasource';
import {RskBlock} from './models/rsk/rsk-block.model';
import {DaemonService} from './services/daemon.service';
import {NodeBridgeDataProvider} from './services/node-bridge-data.provider';
import {PeginStatusMongoDbDataService} from './services/pegin-status-data-services/peg-status.mongodb.service';
import {RskChainSyncService} from './services/rsk-chain-sync.service';
import {RskNodeService} from './services/rsk-node.service';
import {SyncStatusMongoService} from './services/sync-status-mongo.service';

export class DaemonRunner {
  daemonService: DaemonService;
  mongoDbDatasource: MongoDbDataSource;

  constructor() {
    const MONGO_DB_URI = `mongodb://${process.env.RSK_DB_USER}:${process.env.RSK_DB_PASS}@${process.env.RSK_DB_URL}:${process.env.RSK_DB_PORT}/${process.env.RSK_DB_NAME}`;
    this.mongoDbDatasource = new MongoDbDataSource(MONGO_DB_URI);

    let defaultInitialBlock = new RskBlock(
      parseInt(process.env.SYNC_INITIAL_BLOCK_HEIGHT || '0'),
      process.env.SYNC_INITIAL_BLOCK_HASH || '',
      process.env.SYNC_INITIAL_BLOCK_PREV_HASH || ''
    );
    let syncService = new RskChainSyncService(
      new SyncStatusMongoService(this.mongoDbDatasource),
      new RskNodeService(),
      defaultInitialBlock,
      parseInt(process.env.SYNC_MIN_DEPTH || '6')
    );

    this.daemonService = new DaemonService(
      new NodeBridgeDataProvider(),
      new PeginStatusMongoDbDataService(MONGO_DB_URI),
      syncService,
      process.env.SYNC_INTERVAL_TIME
    );
  }

  async start(): Promise<void> {
    await this.mongoDbDatasource.connect();
    await this.daemonService.start();
  }

  async stop(): Promise<void> {
    await this.daemonService.stop();
    await this.mongoDbDatasource.disconnect();
  }
}
