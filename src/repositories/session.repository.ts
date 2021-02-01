import {inject} from '@loopback/core';
import {DefaultCrudRepository} from '@loopback/repository';
import {SessionDataSource} from '../datasources';
import {Session, SessionRelations} from '../models';

export class SessionRepository extends DefaultCrudRepository<
  Session,
  typeof Session.prototype.sessionId,
  SessionRelations
> {
  constructor(
    @inject('datasources.sesion') dataSource: SessionDataSource,
  ) {
    super(Session, dataSource);
  }
}
