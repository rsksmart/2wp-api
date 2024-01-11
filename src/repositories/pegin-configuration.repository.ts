import {DefaultCrudRepository} from '@loopback/repository';
import {inject} from '@loopback/core';
import {PeginConfiguration} from '../models';
import {DbDataSource} from '../datasources';

export class PeginConfigurationRepository extends DefaultCrudRepository<
  PeginConfiguration,
  typeof PeginConfiguration.prototype.ID
> {
  constructor(@inject('datasources.db') dataSource: DbDataSource) {
    super(PeginConfiguration, dataSource);
  }
}
