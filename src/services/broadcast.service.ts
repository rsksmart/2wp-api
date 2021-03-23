import {inject, Provider} from '@loopback/core';
import {getService} from '@loopback/service-proxy';
import {TxBroadcastDataSource} from '../datasources';

export interface TxStatus {
  result?: string;
  error?: {
    message: string;
  };
}

export interface Broadcast {
  // this is where you define the Node.js methods that will be
  // mapped to REST/SOAP/gRPC operations as stated in the datasource
  // json file.
  broadcast(hexTx: string): Promise<TxStatus[]>;
}

export class BroadcastProvider implements Provider<Broadcast> {
  constructor(
    // txBroadcast must match the name property in the datasource json file
    @inject('datasources.txBroadcast')
    protected dataSource: TxBroadcastDataSource = new TxBroadcastDataSource(),
  ) {}

  value(): Promise<Broadcast> {
    return getService(this.dataSource);
  }
}
