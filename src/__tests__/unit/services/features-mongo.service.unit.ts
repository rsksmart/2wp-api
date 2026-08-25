import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {MONGO_MAX_DOCUMENTS} from '../../../config/resource-budgets';
import {FeaturesMongoDbDataService} from '../../../services/features-mongo.service';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

/**
 * `GET /features` is public and unauthenticated, and read the whole collection
 * with `find({})`. The collection is small and operator-managed today, so this
 * is a ceiling rather than a page size — but an unbounded read on a public route
 * is exactly the shape every other budget here exists to remove.
 */
describe('Service: FeaturesMongoService bounded reads', () => {
  let service: FeaturesMongoDbDataService;
  let find: sinon.SinonStub;
  let limit: sinon.SinonStub;
  let exec: sinon.SinonStub;

  const givenDocuments = (count: number) =>
    Array.from({length: count}, (_, i) => ({
      name: `flag_${i}`,
      value: 'enabled',
      creationDate: new Date(),
      lastUpdateDate: new Date(),
    }));

  beforeEach(() => {
    resetMetricCounters();
    // The datasource is never reached: the connector is stubbed below.
    service = new FeaturesMongoDbDataService({} as never);
    exec = sinon.stub();
    limit = sinon.stub().returns({exec});
    find = sinon.stub().returns({limit, exec});
    sinon
      .stub(service as unknown as {getConnector: () => unknown}, 'getConnector')
      .returns({find});
  });

  afterEach(() => sinon.restore());

  it('asks the database for no more than the budget allows', async () => {
    exec.resolves(givenDocuments(3));

    await service.getAll();

    // Bounding in the query, not after: a cap applied to an already-materialized
    // array would have bought nothing.
    sinon.assert.calledWith(limit, MONGO_MAX_DOCUMENTS);
  });

  it('returns the documents it read', async () => {
    exec.resolves(givenDocuments(3));

    const features = await service.getAll();

    expect(features).to.have.length(3);
  });

  it('records a violation when the database fills the budget', async () => {
    // At exactly the limit the read may have been truncated, which is worth
    // knowing about: it means the collection outgrew the assumption.
    exec.resolves(givenDocuments(MONGO_MAX_DOCUMENTS));

    await service.getAll();

    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.MONGO_DOCUMENTS,
      }),
    ).to.equal(1);
  });

  it('stays quiet for an ordinary read', async () => {
    exec.resolves(givenDocuments(14));

    await service.getAll();

    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.MONGO_DOCUMENTS,
      }),
    ).to.equal(0);
  });
});
