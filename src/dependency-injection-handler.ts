import {Application, BindingScope} from '@loopback/core';
import {TxV2ProviderDataSource} from './datasources';
import {MongoDbDataSource} from './datasources/mongodb.datasource';
import {ConstantsBindings, DatasourcesBindings, ServicesBindings} from './dependency-injection-bindings';
import {RskBlock} from './models/rsk/rsk-block.model';
import {BitcoinService, BridgeService, PeginStatusService} from './services';
import {DaemonService} from './services/daemon.service';
import {NodeBridgeDataProvider} from './services/node-bridge-data.provider';
import {PeginStatusMongoDbDataService} from './services/pegin-status-data-services/pegin-status-mongo.service';
import {RegisterBtcTransactionDataParser} from './services/register-btc-transaction-data.parser';
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
      .to(process.env.RSK_DB_CONNECTION_STRING);

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
      .bind(ServicesBindings.REGISTER_BTC_TRANSACTION_DATA_PARSER)
      .toClass(RegisterBtcTransactionDataParser)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(ServicesBindings.DAEMON_SERVICE)
      .toClass(DaemonService)
      .inScope(BindingScope.SINGLETON);

    app
      .bind(ServicesBindings.BRIDGE_SERVICE)
      .toClass(BridgeService)
      .inScope(BindingScope.SINGLETON);

  }
}
