import {DefaultCrudRepository} from '@loopback/repository';
import {PeginConfiguration, PeginConfigurationRelations} from '../models';
import {DbDataSource} from '../datasources';
import {inject} from '@loopback/core';

export class PeginConfigurationRepository extends DefaultCrudRepository<
  PeginConfiguration,
  typeof PeginConfiguration.prototype.ID,
  PeginConfigurationRelations
> {
  constructor(@inject('datasources.db') dataSource: DbDataSource) {
    super(PeginConfiguration, dataSource);
  }
}
