import {inject, Provider} from '@loopback/core';
import {getService} from '@loopback/service-proxy';
import {TxProviderDataSource} from '../datasources';

export interface Tx {
  txid: string;
  version: number;
  vin: object[];
  vout: object[];
  blockhash: string;
  blockheight: number;
  confirmations: number;
  time: number;
  blocktime: number;
  valueOut: string;
  valueIn: string;
  fees: string;
  hex: string;
}

export interface TxService {
  // this is where you define the Node.js methods that will be
  // mapped to REST/SOAP/gRPC operations as stated in the datasource
  // json file.
  txProvider(txId: string): Promise<Tx[]>;
}

export class TxServiceProvider implements Provider<TxService> {
  constructor(
    // txProvider must match the name property in the datasource json file
    @inject('datasources.txProvider')
    protected dataSource: TxProviderDataSource = new TxProviderDataSource(),
  // eslint-disable-next-line no-empty-function
  ) {}

  value(): Promise<TxService> {
    return getService(this.dataSource);
  }
}
