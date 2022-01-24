import {inject, Provider} from '@loopback/core';
import {getService} from '@loopback/service-proxy';
import {TxFeeProviderDataSource} from '../datasources';

export interface FeeLevel {
  // this is where you define the Node.js methods that will be
  // mapped to REST/SOAP/gRPC operations as stated in the datasource
  // json file.
  feeProvider(block: number): Promise<string>;
}

export class FeeLevelProvider implements Provider<FeeLevel> {
  constructor(
    // txFeeProvider must match the name property in the datasource json file
    @inject('datasources.txFeeProvider')
    protected dataSource: TxFeeProviderDataSource = new TxFeeProviderDataSource(),
  ) {}

  value(): Promise<FeeLevel> {
    return getService(this.dataSource);
  }
}
