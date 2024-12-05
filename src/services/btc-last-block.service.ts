import {inject, Provider} from '@loopback/core';
import {getService} from '@loopback/service-proxy';
import {LastBlockProviderDataSource} from '../datasources';
import {DatasourcesBindings} from '../dependency-injection-bindings';

export interface LastBlockInfoResponse {
  blockbook: BlockBook;
  backend: BackEnd;
}

export interface BlockBook {
    coin: string,
    host: string,
    version: string,
    syncMode: boolean,
    inSync: boolean,
    initialSync: boolean,
    bestHeight: number,
}

export interface BackEnd {
    chain: string,
    blocks: number,
    bestBlockHash: string,
}

export interface LastBlockService {
  // this is where you define the Node.js methods that will be
  // mapped to REST/SOAP/gRPC operations as stated in the datasource
  // json file.
  lastBlockProvider(): Promise<LastBlockInfoResponse>;
}

export class LastBlockServiceProvider implements Provider<LastBlockService> {
  constructor(
    // txV2Provider must match the name property in the datasource json file
    @inject(DatasourcesBindings.BTC_LAST_BLOCK_PROVIDER)
    protected dataSource: LastBlockProviderDataSource = new LastBlockProviderDataSource(),
  ) { }

  value(): Promise<LastBlockService> {
    return getService(this.dataSource);
  }
}
