import {inject, Provider} from '@loopback/core';
import {getService} from '@loopback/service-proxy';
import {AddressProviderDataSource} from '../datasources/address-provider.datasource';

export interface Address {
  content: string;
}

export interface AddressService {
  // this is where you define the Node.js methods that will be
  // mapped to REST/SOAP/gRPC operations as stated in the datasource
  // json file.
  addressProvider(address: string): Promise<Address>
}

export class AddressServiceProvider implements Provider<AddressService> {
  constructor(
    // addressProvider must match the name property in the datasource json file
    @inject('datasources.addressProvider')

    protected dataSource: AddressProviderDataSource = new AddressProviderDataSource(),
  ) { }

  value(): Promise<AddressService> {
    return getService(this.dataSource);
  }
}
