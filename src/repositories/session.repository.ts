import {inject} from '@loopback/core';
import {DefaultKeyValueRepository} from '@loopback/repository';
import {getLogger, Logger} from 'log4js';
import {RedisDataSource} from '../datasources';
import {Session} from '../models';
import {BtcAddressUtils} from '../utils/btc-utils';

export class SessionRepository extends DefaultKeyValueRepository<Session> {

  logger: Logger;
  btcAddressUtils: BtcAddressUtils = new BtcAddressUtils();

  constructor(@inject('datasources.Redis') dataSource: RedisDataSource) {
    super(Session, dataSource);
    this.logger = getLogger('sessionRepository');
  }

}
