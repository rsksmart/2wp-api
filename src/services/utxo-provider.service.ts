import {inject, Provider} from '@loopback/core';
import {getService} from '@loopback/service-proxy';
import {UtxoProviderDataSource} from '../datasources';

export interface Utxo {
  txid: string;
  vout: number;
  amount: string;
  satoshis: number;
  height: number;
  confirmations: number;
}

export interface UtxoProvider {
  // this is where you define the Node.js methods that will be
  // mapped to REST/SOAP/gRPC operations as stated in the datasource
  // json file.
  utxoProvider(address: string): Promise<Utxo[]>;
}

export class UtxoProviderProvider implements Provider<UtxoProvider> {
  constructor(
    // utxoProvider must match the name property in the datasource json file
    @inject('datasources.utxoProvider')
    protected dataSource: UtxoProviderDataSource = new UtxoProviderDataSource(),
  ) {}

  value(): Promise<UtxoProvider> {
    return getService(this.dataSource);
  }
}
