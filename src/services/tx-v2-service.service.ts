import {inject, Provider} from '@loopback/core';
import {getService} from '@loopback/service-proxy';
import {TxV2ProviderDataSource} from '../datasources';
import {DatasourcesBindings} from '../dependency-injection-bindings';

export interface Txv2 {
  content: string;
}

export interface TxV2Service {
  // this is where you define the Node.js methods that will be
  // mapped to REST/SOAP/gRPC operations as stated in the datasource
  // json file.
  txV2Provider(txId: string): Promise<Txv2>;
}

export class TxV2ServiceProvider implements Provider<TxV2Service> {
  constructor(
    // txV2Provider must match the name property in the datasource json file
    @inject(DatasourcesBindings.TX_V2_PROVIDER)
    protected dataSource: TxV2ProviderDataSource = new TxV2ProviderDataSource(),
  ) {}

  value(): Promise<TxV2Service> {
    return getService(this.dataSource);
  }
}
