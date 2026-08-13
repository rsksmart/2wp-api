import {expect, sinon} from '@loopback/testlab';
import mongoose from 'mongoose';
import {MongoDbDataSource} from '../../../datasources/mongodb.datasource';
import {PegoutStatusMongoDbDataService} from '../../../services/pegout-status-data-services/pegout-status-mongo.service';

// Mimics a chainable mongoose Query (find().sort().limit().exec()) without hitting a real database.
function mockQuery(result: any) {
  const query: any = {};
  query.sort = sinon.stub().returns(query);
  query.limit = sinon.stub().returns(query);
  query.exec = sinon.stub().resolves(result);
  return query;
}

describe('Service: PegoutStatusMongoDbDataService', () => {
  let service: PegoutStatusMongoDbDataService;
  // Untyped on purpose: mongoose's overloaded Model methods make sinon's stub/withArgs typings unusable here.
  let connector: any;

  beforeEach(() => {
    service = new PegoutStatusMongoDbDataService(<MongoDbDataSource>{});
    sinon.stub(service as any, 'verifyAndCreateConnectionIfIsNecessary').resolves();
    connector = mongoose.model('PegoutStatus');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('deletes every row at the given height and restores the previous status of any pegout that lost its current one', async () => {
    const deletedHeight = 100;
    const currentRow = {rskTxHash: '0xcurrent', originatingRskTxHash: '0xorig', rskBlockHeight: deletedHeight};
    const previousRow = {rskTxHash: '0xprevious', originatingRskTxHash: '0xorig', rskBlockHeight: 90};

    const findStub = sinon.stub(connector, 'find');
    findStub.withArgs({rskBlockHeight: deletedHeight, isNewestStatus: true}).returns(mockQuery([currentRow]));
    findStub
      .withArgs({originatingRskTxHash: '0xorig', rskBlockHeight: {$ne: deletedHeight}})
      .returns(mockQuery([previousRow]));

    const deleteManyStub = sinon.stub(connector, 'deleteMany').returns(<any>{exec: sinon.stub().resolves()});
    const updateOneStub = sinon.stub(connector, 'updateOne').returns(<any>{exec: sinon.stub().resolves()});

    const result = await service.deleteByRskBlockHeight(deletedHeight);

    expect(result).to.be.true();
    sinon.assert.calledOnceWithExactly(deleteManyStub, {rskBlockHeight: deletedHeight});
    sinon.assert.calledOnceWithExactly(updateOneStub, {rskTxHash: previousRow.rskTxHash}, {isNewestStatus: true});
  });

  it('does not restore anything when the deleted rows were never the current status of any pegout', async () => {
    const deletedHeight = 100;

    const findStub = sinon.stub(connector, 'find');
    findStub.withArgs({rskBlockHeight: deletedHeight, isNewestStatus: true}).returns(mockQuery([]));

    const deleteManyStub = sinon.stub(connector, 'deleteMany').returns(<any>{exec: sinon.stub().resolves()});
    const updateOneStub = sinon.stub(connector, 'updateOne');

    const result = await service.deleteByRskBlockHeight(deletedHeight);

    expect(result).to.be.true();
    sinon.assert.calledOnceWithExactly(deleteManyStub, {rskBlockHeight: deletedHeight});
    sinon.assert.notCalled(updateOneStub);
    // Only the one lookup for current rows should have happened, no lookup for a "previous" row.
    sinon.assert.calledOnce(findStub);
  });

  it('does not restore anything when the pegout has no earlier status to fall back to', async () => {
    const deletedHeight = 100;
    const currentRow = {rskTxHash: '0xcurrent', originatingRskTxHash: '0xorig', rskBlockHeight: deletedHeight};

    const findStub = sinon.stub(connector, 'find');
    findStub.withArgs({rskBlockHeight: deletedHeight, isNewestStatus: true}).returns(mockQuery([currentRow]));
    findStub
      .withArgs({originatingRskTxHash: '0xorig', rskBlockHeight: {$ne: deletedHeight}})
      .returns(mockQuery([]));

    sinon.stub(connector, 'deleteMany').returns(<any>{exec: sinon.stub().resolves()});
    const updateOneStub = sinon.stub(connector, 'updateOne');

    const result = await service.deleteByRskBlockHeight(deletedHeight);

    expect(result).to.be.true();
    sinon.assert.notCalled(updateOneStub);
  });
});
