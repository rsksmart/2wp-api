import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import mongoose from 'mongoose';
import {MongoDbDataSource} from '../../../datasources/mongodb.datasource';
import {MongoDbDataService} from '../../../services/mongodb-data.service';
import {SearchableModel} from '../../../models/rsk/searchable-model';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

class TestModel implements SearchableModel {
  constructor(readonly id: string) {}
  getId() {
    return this.id;
  }
  getIdFieldName() {
    return 'id';
  }
}

/** The smallest concrete subclass the base class will accept. */
class TestDataService extends MongoDbDataService<TestModel, never> {
  protected getLoggerName(): string {
    return 'testDataService';
  }
  protected getConnector(): mongoose.Model<never> {
    return {} as mongoose.Model<never>;
  }
  protected getByIdFilter(id: unknown) {
    return {id};
  }
  protected getManyFilter(filter?: unknown) {
    return filter;
  }
}

/**
 * `ensureConnection` is the same idiom one layer up, and it fails in a second
 * way as well: it reported success unconditionally, so a caller that awaited it
 * before touching the connector was told the connection was ready when no
 * connection had been attempted yet.
 */
describe('Service: MongoDbDataService connection handling', () => {
  let datasource: sinon.SinonStubbedInstance<MongoDbDataSource>;
  let service: TestDataService;

  beforeEach(() => {
    datasource = sinon.createStubInstance(MongoDbDataSource);
    service = new TestDataService(datasource as unknown as MongoDbDataSource);
  });

  afterEach(() => sinon.restore());

  it('rejects when the connection cannot be established', async () => {
    datasource.getConnection.rejects(new Error('ECONNREFUSED'));

    await expect(service.ensureConnection()).to.be.rejectedWith(/ECONNREFUSED/);
  });

  it('does not report a connection it has not made', async () => {
    // It resolved before `start()` had run at all, so `this.db` was still
    // undefined when the caller believed it was connected.
    let resolveConnect: (m: mongoose.Mongoose) => void = () => {};
    datasource.getConnection.returns(
      new Promise(resolve => {
        resolveConnect = resolve;
      }),
    );

    let settled = false;
    const pending = service.ensureConnection().then(() => (settled = true));
    await delay(20);
    expect(settled).to.be.false();

    resolveConnect({} as mongoose.Mongoose);
    await pending;
    expect(service.db).to.not.be.undefined();
  });

  it('leaves no rejection for the process to handle', async () => {
    const orphans: unknown[] = [];
    const collect = (reason: unknown) => orphans.push(reason);
    process.on('unhandledRejection', collect);
    try {
      datasource.getConnection.rejects(new Error('boom'));

      await service.ensureConnection().catch(() => {});
      await delay(50);

      expect(orphans).to.be.empty();
    } finally {
      process.off('unhandledRejection', collect);
    }
  });

  it('does not reconnect once connected', async () => {
    service.db = {} as mongoose.Mongoose;

    await service.ensureConnection();

    sinon.assert.notCalled(datasource.getConnection);
  });
});
