import {Application, BindingScope} from '@loopback/core';
import {TxV2ProviderDataSource} from './datasources';
import {MongoDbDataSource} from './dataSources/mongodb.datasource';
import {BitcoinService, PeginStatusService} from './services';
import {PeginStatusMongoDbDataService} from './services/pegin-status-data-services/pegin-status-mongo.service';

export class DependencyInjectionHandler {
  public static configureDependencies(app: Application): void {
    this.configureConstants(app);
    this.configureDataSources(app);
    this.configureServices(app);
  }

  private static configureConstants(app: Application): void {
    app
      .bind('constants.mongoDbUri')
      .to(`mongodb://${process.env.RSK_DB_USER}:${process.env.RSK_DB_PASS}@${process.env.RSK_DB_URL}:${process.env.RSK_DB_PORT}/${process.env.RSK_DB_NAME}`);
  }

  private static configureDataSources(app: Application): void {
    app
      .bind('dataSources.MongoDbDataSource')
      .toClass(MongoDbDataSource)
      .inScope(BindingScope.SINGLETON);

    app
      .bind('datasources.txV2Provider')
      .toClass(TxV2ProviderDataSource)
      .inScope(BindingScope.SINGLETON);
  }

  private static configureServices(app: Application): void {
    app
      .bind('services.BitcoinService')
      .toClass(BitcoinService)
      .inScope(BindingScope.SINGLETON);

    app
      .bind('services.PeginStatusDataService')
      .toClass(PeginStatusMongoDbDataService)
      .inScope(BindingScope.SINGLETON);

    app
      .bind('services.PeginStatusService')
      .toClass(PeginStatusService)
      .inScope(BindingScope.SINGLETON);
  }
}
