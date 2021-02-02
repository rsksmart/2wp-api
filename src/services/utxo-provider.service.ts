import {inject, Provider} from '@loopback/core';
import {getService} from '@loopback/service-proxy';
import {UtxoProviderDataSource} from '../datasources';

/* eslint @typescript-eslint/naming-convention: 0 */
export interface Utxo {
  tx_hash: string;
  tx_hash_big_endian: string;
  tx_output_n: number;
  script: string;
  value: number;
  value_hex: string;
  confirmations: number;
  tx_index: number;
}

export interface UtxoProvider {
  // this is where you define the Node.js methods that will be
  // mapped to REST/SOAP/gRPC operations as stated in the datasource
  // json file.
  utxoProvider(address: string): Promise<Utxo []>;
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
