import {Application, BindingScope} from '@loopback/core';
import {TxV2ProviderDataSource, MongoDbDataSource} from './datasources';
import {ConstantsBindings, DatasourcesBindings, ServicesBindings} from './dependency-injection-bindings';
import {RskBlock} from './models/rsk/rsk-block.model';
import {BitcoinService, PeginStatusService} from './services';
import {DaemonService} from './services/daemon.service';
import {NodeBridgeDataProvider} from './services/node-bridge-data.provider';
import {PeginStatusMongoDbDataService} from './services/pegin-status-data-services/pegin-status-mongo.service';
import {RskChainSyncService} from './services/rsk-chain-sync.service';
import {RskNodeService} from './services/rsk-node.service';
import {SyncStatusMongoService} from './services/sync-status-mongo.service';

export class DependencyInjectionHandler {
  public static configureDependencies(app: Application): void {
    this.configureConstants(app);
    this.configureDatasources(app);
    this.configureServices(app);
  }

  private static configureConstants(app: Application): void {
    app
      .bind(ConstantsBindings.MONGO_DB_URI)
      .to(`mongodb://${process.env.RSK_DB_USER}:${process.env.RSK_DB_PASS}@${process.env.RSK_DB_URL}:${process.env.RSK_DB_PORT}/${process.env.RSK_DB_NAME}`);

    app
      .bind(ConstantsBindings.INITIAL_BLOCK)
      .to(new RskBlock(
        parseInt(process.env.SYNC_INITIAL_BLOCK_HEIGHT || '0'),
        process.env.SYNC_INITIAL_BLOCK_HASH || '',
        process.env.SYNC_INITIAL_BLOCK_PREV_HASH || ''
      ));

    app
      .bind(ConstantsBindings.MIN_DEPTH_FOR_SYNC)
      .to(parseInt(process.env.SYNC_MIN_DEPTH || '6'));

    app
      .bind(ConstantsBindings.SYNC_INTERVAL_TIME)
      .to(process.env.SYNC_INTERVAL_TIME || '30000');
  }

  private static configureDatasources(app: Application): void {
    app
      .bind(DatasourcesBindings.MONGO_DB_DATASOURCE)
      .toClass(MongoDbDataSource)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(DatasourcesBindings.TX_V2_PROVIDER)
      .toClass(TxV2ProviderDataSource)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(DatasourcesBindings.RSK_BRIDGE_DATA_PROVIDER)
      .toClass(NodeBridgeDataProvider)
      .inScope(BindingScope.SINGLETON);
  }

  private static configureServices(app: Application): void {
    app
      .bind(ServicesBindings.BITCOIN_SERVICE)
      .toClass(BitcoinService)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(ServicesBindings.RSK_NODE_SERVICE)
      .toClass(RskNodeService)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(ServicesBindings.PEGIN_STATUS_DATA_SERVICE)
      .toClass(PeginStatusMongoDbDataService)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(ServicesBindings.PEGIN_STATUS_SERVICE)
      .toClass(PeginStatusService)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(ServicesBindings.SYNC_STATUS_DATA_SERVICE)
      .toClass(SyncStatusMongoService)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(ServicesBindings.RSK_CHAIN_SYNC_SERVICE)
      .toClass(RskChainSyncService)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(ServicesBindings.DAEMON_SERVICE)
      .toClass(DaemonService)
      .inScope(BindingScope.SINGLETON);
  }
}
