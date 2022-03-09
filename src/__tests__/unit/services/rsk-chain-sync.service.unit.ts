import {expect, sinon} from '@loopback/testlab';
import {RskBlock} from '../../../models/rsk/rsk-block.model';
import {SyncStatusModel} from '../../../models/rsk/sync-status.model';
import {RskChainSyncService} from '../../../services/rsk-chain-sync.service';
import {RskNodeService} from '../../../services/rsk-node.service';
import {SyncStatusDataService} from '../../../services/sync-status-data.service';
import { BlockTransactionObject, Transaction } from 'web3-eth';

const getRskNodeService = () => {
  const mockedRskNodeService = sinon.createStubInstance(RskNodeService);
  return mockedRskNodeService;
};

const mockSyncStatusDataService = () => {
  class MockedSyncStatusDataService implements SyncStatusDataService {
    getBestBlock(): Promise<SyncStatusModel> {
      throw new Error('Method not implemented.');
    }
    getById(id: any): Promise<SyncStatusModel> {
      throw new Error('Method not implemented.');
    }
    getMany(query?: any): Promise<SyncStatusModel[]> {
      throw new Error('Method not implemented.');
    }
    set(data: SyncStatusModel): Promise<boolean> {
      throw new Error('Method not implemented.');
    }
    delete(id: any): Promise<boolean> {
      throw new Error('Method not implemented.');
    }
    start(): Promise<void> {
      throw new Error('Method not implemented.');
    }
    stop(): Promise<void> {
      throw new Error('Method not implemented.');
    }

  }

  const mock = sinon.createStubInstance(MockedSyncStatusDataService);
  return mock;
};

const getInitialBlock = () => new RskBlock(0, '0xba5e', '0x');

describe('Service: RskChainSyncService', () => {

  it('starts and stops', async () => {
    const mockedSyncStatusDataService = mockSyncStatusDataService();

    const thisService = new RskChainSyncService(mockedSyncStatusDataService, getRskNodeService(), getInitialBlock(), 1);
    await thisService.start();
    await thisService.stop();

    sinon.assert.calledOnce(mockedSyncStatusDataService.start);
    sinon.assert.calledOnce(mockedSyncStatusDataService.stop);
  });

  it('should not call start again if it has started', async () => {
    const mockedSyncStatusDataService = mockSyncStatusDataService();
    const thisService = new RskChainSyncService(mockedSyncStatusDataService, getRskNodeService(), getInitialBlock(), 1);
    await thisService.start();
    await thisService.start(); // start() called again. SyncStatusDataService::start should be called only once.
    await thisService.stop();
    sinon.assert.calledOnce(mockedSyncStatusDataService.start);
    sinon.assert.calledOnce(mockedSyncStatusDataService.stop);
  });

  it('should not call stop again if it has stopped', async () => {
    const mockedSyncStatusDataService = mockSyncStatusDataService();
    const thisService = new RskChainSyncService(mockedSyncStatusDataService, getRskNodeService(), getInitialBlock(), 1);
    await thisService.start();
    await thisService.stop();
    await thisService.stop(); // stop() called again. SyncStatusDataService::stop should be called only once.
    sinon.assert.calledOnce(mockedSyncStatusDataService.start);
    sinon.assert.calledOnce(mockedSyncStatusDataService.stop);
  });

  it('gets sync status from service', async () => {
    const mockedSyncStatusDataService = mockSyncStatusDataService();

    const bestSyncedBlock = new SyncStatusModel("0xbe57", 666, "0xdad1");
    mockedSyncStatusDataService.getBestBlock.resolves(bestSyncedBlock);

    const thisService = new RskChainSyncService(mockedSyncStatusDataService, getRskNodeService(), getInitialBlock(), 1);
    const bestBlock = await thisService.getSyncStatus();
    expect(bestBlock).to.be.equal(bestSyncedBlock);
    // If RskChainSyncService start is not manually called it will be called once when the status is requested
    sinon.assert.calledOnce(mockedSyncStatusDataService.start);
  });

  it('gets sync status from default if service does not have it', async () => {
    const initialBlock = getInitialBlock();
    const mockedSyncStatusDataService = mockSyncStatusDataService();
    mockedSyncStatusDataService.getBestBlock.resolves(undefined);

    const thisService = new RskChainSyncService(mockedSyncStatusDataService, getRskNodeService(), initialBlock, 1);
    await thisService.start();
    const bestBlock = await thisService.getSyncStatus();
    expect(bestBlock.rskBlockHash).to.be.equal(initialBlock.hash);
  });

  it('allows subscribe and unsubscribe from events', async () => {
    const subscriber = {
      blockDeleted: (block: RskBlock): void => { },
      blockAdded: (block: RskBlock): void => { }
    };

    const thisService = new RskChainSyncService(mockSyncStatusDataService(), getRskNodeService(), getInitialBlock(), 1);
    await thisService.start();
    thisService.subscribe(subscriber);
    thisService.unsubscribe(subscriber);
    thisService.unsubscribe(subscriber); // When unsubscribe called twice with the same subscriber, should do nothing.
  });

  it('adds new block and informs observers', async () => {
    // Mock RSK and Sync statuses
    // rsk chain => [1, 2, 3]
    // sync      => [1]
    // Expected: sync should receive block # 2 only with no reorganization
    const firstBlock = new SyncStatusModel("0x0001", 1, '0x');

    const transactions: Transaction[] = [];

    const secondBlock = {
      hash: '0x0002',
      parentHash: firstBlock.rskBlockHash,
      number: firstBlock.rskBlockHeight + 1,
      transactions
    };
    const bestBlock = {
      hash: '0x0003',
      parentHash: secondBlock.hash,
      number: secondBlock.number + 1,
      transactions
    };

    const mockedSyncStatusDataService = mockSyncStatusDataService();
    mockedSyncStatusDataService.getBestBlock.resolves(firstBlock);

    const mockedRskNodeService = getRskNodeService();
    mockedRskNodeService.getBlock.withArgs('latest').resolves(<BlockTransactionObject>bestBlock);
    mockedRskNodeService.getBlock.withArgs(2).resolves(<BlockTransactionObject>secondBlock);

    const subscriber = sinon.spy({
      blockDeleted: (): void => { },
      blockAdded: (): void => { }
    });

    const thisService = new RskChainSyncService(mockedSyncStatusDataService, mockedRskNodeService, getInitialBlock(), 0);
    await thisService.start();
    thisService.subscribe(subscriber);
    await thisService.sync();

    // RSK is contacted
    sinon.assert.calledTwice(mockedRskNodeService.getBlock);

    // Storage is called
    sinon.assert.calledOnce(mockedSyncStatusDataService.set);

    // subscribers get called
    sinon.assert.calledOnce(subscriber.blockAdded);
    sinon.assert.notCalled(subscriber.blockDeleted);
  });

  it('on fork reorganizes the stored blockchain', async () => {
    // Mock RSK and Sync statuses
    // rsk chain => [1 => 2 => 3 => 4]
    // sync      => [1 => 2a]
    // Expected: sync should detect fork at height 2, deletes 2a, and stores 2 and 3
    const firstBlock = new SyncStatusModel('0x0001', 1, '0x');

    const secondBlockFromSync = new SyncStatusModel('0x0002a', firstBlock.rskBlockHeight + 1, firstBlock.rskBlockHash);

    const transactions: Transaction[] = [];

    const firstBlockFromRsk = {
      hash: firstBlock.rskBlockHash,
      parentHash: firstBlock.rskBlockParentHash,
      number: firstBlock.rskBlockHeight,
      transactions
    };
    const secondBlockFromRsk = {
      hash: '0x0002',
      parentHash: firstBlockFromRsk.hash,
      number: firstBlockFromRsk.number + 1,
      transactions
    };
    const thirdBlockFromRsk = {
      hash: '0x0003',
      parentHash: secondBlockFromRsk.hash,
      number: secondBlockFromRsk.number + 1,
      transactions
    };
    const bestBlock = {
      hash: '0x0004',
      parentHash: thirdBlockFromRsk.hash,
      number: thirdBlockFromRsk.number + 1,
      transactions
    };

    const mockedSyncStatusDataService = mockSyncStatusDataService();
    mockedSyncStatusDataService.getBestBlock.resolves(secondBlockFromSync);
    mockedSyncStatusDataService.getById.withArgs(firstBlock.rskBlockHash).resolves(firstBlock);

    const mockedRskNodeService = getRskNodeService();
    mockedRskNodeService.getBlock.withArgs('latest').resolves(<BlockTransactionObject>bestBlock);
    mockedRskNodeService.getBlock.withArgs(1).resolves(<BlockTransactionObject>secondBlockFromRsk);
    mockedRskNodeService.getBlock.withArgs(2).resolves(<BlockTransactionObject>secondBlockFromRsk);
    mockedRskNodeService.getBlock.withArgs(3).resolves(<BlockTransactionObject>thirdBlockFromRsk);

    const subscriber = sinon.spy({
      blockDeleted: (): void => { },
      blockAdded: (): void => { }
    });

    const thisService = new RskChainSyncService(mockedSyncStatusDataService, mockedRskNodeService, getInitialBlock(), 0);
    await thisService.start();
    thisService.subscribe(subscriber);
    await thisService.sync();

    // RSK is contacted
    sinon.assert.calledThrice(mockedRskNodeService.getBlock);

    // Storage is called
    sinon.assert.calledTwice(mockedSyncStatusDataService.set);
    sinon.assert.calledOnceWithMatch(mockedSyncStatusDataService.delete, secondBlockFromSync.rskBlockHash);

    // subscribers get called
    sinon.assert.calledTwice(subscriber.blockAdded);
    sinon.assert.calledOnce(subscriber.blockDeleted);
  });

  it('does not add blocks beyond the configured min depth', async () => {
    // Mock RSK and Sync statuses
    // min depth => 1
    // rsk chain => [1, 2]
    // sync      => [1]
    // Expected: sync should not add new blocks
    const firstBlock = new SyncStatusModel("0x0001", 1, '0x');

    const bestBlock = {
      hash: '0x0002',
      parentHash: firstBlock.rskBlockHash,
      number: firstBlock.rskBlockHeight + 1
    };

    const mockedSyncStatusDataService = mockSyncStatusDataService();
    mockedSyncStatusDataService.getBestBlock.resolves(firstBlock);

    const mockedRskNodeService = getRskNodeService();
    mockedRskNodeService.getBlock.withArgs('latest').resolves(<BlockTransactionObject>bestBlock);

    const subscriber = sinon.spy({
      blockDeleted: (): void => { },
      blockAdded: (): void => { }
    });

    const thisService = new RskChainSyncService(mockedSyncStatusDataService, mockedRskNodeService, getInitialBlock(), 1);
    await thisService.start();
    thisService.subscribe(subscriber);
    await thisService.sync();

    // RSK is contacted
    sinon.assert.calledOnce(mockedRskNodeService.getBlock);

    // Storage is called
    sinon.assert.notCalled(mockedSyncStatusDataService.set);

    // subscribers get called
    sinon.assert.notCalled(subscriber.blockAdded);
    sinon.assert.notCalled(subscriber.blockDeleted);
  });

  it('when db follows a forked chain longer than the main chain, remove forked blocks', async () => {

    const MIN_DEPTH_FOR_SYNC = 1;

    // Mock RSK and Sync statuses
    // rsk main chain => [1 => 2 => 3 => 4 => 5 => 6]
    // sync forked    => [1 => 2 => 3a => 4a => 5a => 6a => 7a => 8a]
    // Expected 1: sync should detect that main chain is shorter than the synced forked chain and remove
    // the extra blocks (from 8a back to 4a, inclusive, given by the formula
    // dbBestBlockHeight - rskBestBlockHeight + MIN_DEPTH_FOR_SYNC + 2) to leave it in a state that the rest of the logic
    // would take care of: main [1 => 2 => 3 => 4 => 5 => 6], sync forked [1 => 2 => 3a].
    // At this point, the main chain is longer than the sync forked chain, and the rest of the logic will manage that.
    // Expected 2: sync should detect fork at height 3, deletes 3a, and stores 3 and 4.
    // Does not add the block 5 or 6 because of the MIN_DEPTH_FOR_SYNC.

    // Mocked blocks from db sync
    const blockFromSync1 = new SyncStatusModel('0x0001', 1, '0x'); // main
    const blockFromSync2 = new SyncStatusModel('0x0002', 2, blockFromSync1.rskBlockHash); // main
    const blockFromSync3 = new SyncStatusModel('0x0003a', 3, blockFromSync2.rskBlockHash); // forked
    const blockFromSync4 = new SyncStatusModel('0x0004a', 4, blockFromSync3.rskBlockHash); // forked
    const blockFromSync5 = new SyncStatusModel('0x0005a', 5, blockFromSync4.rskBlockHash); // forked
    const blockFromSync6 = new SyncStatusModel('0x0006a', 6, blockFromSync5.rskBlockHash); // forked
    const blockFromSync7 = new SyncStatusModel('0x0007a', 7, blockFromSync6.rskBlockHash); // forked
    const blockFromSync8 = new SyncStatusModel('0x0008a', 8, blockFromSync7.rskBlockHash); // forked

    // Mocked blocks from rsk
    const blockFromRsk1 = {
      hash: blockFromSync1.rskBlockHash,
      parentHash: blockFromSync1.rskBlockParentHash,
      number: blockFromSync1.rskBlockHeight
    };

    const blockFromRsk2 = {
      hash: '0x0002',
      parentHash: blockFromRsk1.hash,
      number: blockFromRsk1.number + 1
    };

    const blockFromRsk3 = {
      hash: '0x0003',
      parentHash: blockFromRsk2.hash,
      number: blockFromRsk2.number + 1
    };

    const blockFromRsk4 = {
      hash: '0x0004',
      parentHash: blockFromRsk3.hash,
      number: blockFromRsk3.number + 1
    };

    const blockFromRsk5 = {
      hash: '0x0005',
      parentHash: blockFromRsk4.hash,
      number: blockFromRsk4.number + 1
    };

    const bestBlockFromRsk = {
      hash: '0x0006',
      parentHash: blockFromRsk5.hash,
      number: blockFromRsk5.number + 1
    };

    const mockedSyncStatusDataService = mockSyncStatusDataService();
    mockedSyncStatusDataService.getBestBlock.resolves(blockFromSync8);
    mockedSyncStatusDataService.getById.withArgs(blockFromSync7.rskBlockHash).resolves(blockFromSync7);
    mockedSyncStatusDataService.getById.withArgs(blockFromSync6.rskBlockHash).resolves(blockFromSync6);
    mockedSyncStatusDataService.getById.withArgs(blockFromSync5.rskBlockHash).resolves(blockFromSync5);
    mockedSyncStatusDataService.getById.withArgs(blockFromSync4.rskBlockHash).resolves(blockFromSync4);
    mockedSyncStatusDataService.getById.withArgs(blockFromSync3.rskBlockHash).resolves(blockFromSync3);
    mockedSyncStatusDataService.getById.withArgs(blockFromSync2.rskBlockHash).resolves(blockFromSync2);

    const mockedRskNodeService = getRskNodeService();
    mockedRskNodeService.getBlock.withArgs('latest').resolves(bestBlockFromRsk);
    mockedRskNodeService.getBlock.withArgs(2).resolves(blockFromRsk2);
    mockedRskNodeService.getBlock.withArgs(3).resolves(blockFromRsk3);
    mockedRskNodeService.getBlock.withArgs(4).resolves(blockFromRsk4);

    const subscriber = sinon.spy({
      blockDeleted: (): void => { },
      blockAdded: (): void => { }
    });

    const thisService = new RskChainSyncService(mockedSyncStatusDataService, mockedRskNodeService, getInitialBlock(), MIN_DEPTH_FOR_SYNC);
    await thisService.start();
    thisService.subscribe(subscriber);
    await thisService.sync();

    // Storage is queried
    sinon.assert.callCount(mockedSyncStatusDataService.getById, 6);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.getById, blockFromSync7.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.getById, blockFromSync6.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.getById, blockFromSync5.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.getById, blockFromSync4.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.getById, blockFromSync3.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.getById, blockFromSync2.rskBlockHash);

    // Storage should not be queried with these blocks (1 and 8)
    sinon.assert.neverCalledWithMatch(mockedSyncStatusDataService.getById, blockFromSync1.rskBlockHash);
    sinon.assert.neverCalledWithMatch(mockedSyncStatusDataService.getById, blockFromSync8.rskBlockHash);

    // RSK is contacted with these blocks (3 and 4)
    sinon.assert.calledThrice(mockedRskNodeService.getBlock);
    sinon.assert.calledWithExactly(mockedRskNodeService.getBlock, 'latest', false);
    sinon.assert.calledWithExactly(mockedRskNodeService.getBlock, 4, false);
    sinon.assert.calledWithExactly(mockedRskNodeService.getBlock, 3, false);

    // RSK should not be contacted with these blocks (5 and 6)
    sinon.assert.neverCalledWithMatch(mockedRskNodeService.getBlock, 5, false);
    sinon.assert.neverCalledWithMatch(mockedRskNodeService.getBlock, 6, false);

    // Storage is called to save the new blocks (3 and 4).
    sinon.assert.calledTwice(mockedSyncStatusDataService.set);
    sinon.assert.calledWithMatch(mockedSyncStatusDataService.set, new SyncStatusModel(blockFromRsk3.hash, blockFromRsk3.number, blockFromRsk3.parentHash));
    sinon.assert.calledWithMatch(mockedSyncStatusDataService.set, new SyncStatusModel(blockFromRsk4.hash, blockFromRsk4.number, blockFromRsk4.parentHash));

    // Asserts all forked blocks are deleted (from forked 8 to forked 3)
    sinon.assert.callCount(mockedSyncStatusDataService.delete, 6);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.delete, blockFromSync8.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.delete, blockFromSync7.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.delete, blockFromSync6.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.delete, blockFromSync5.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.delete, blockFromSync4.rskBlockHash);
    sinon.assert.calledWithExactly(mockedSyncStatusDataService.delete, blockFromSync3.rskBlockHash);

    // Assert these blocks are not deleted (1 and 2)
    sinon.assert.neverCalledWithMatch(mockedSyncStatusDataService.delete, blockFromSync1.rskBlockHash);
    sinon.assert.neverCalledWithMatch(mockedSyncStatusDataService.delete, blockFromSync2.rskBlockHash);

    // subscribers get called
    sinon.assert.calledTwice(subscriber.blockAdded);
    sinon.assert.callCount(subscriber.blockDeleted, 6);

  });

});
