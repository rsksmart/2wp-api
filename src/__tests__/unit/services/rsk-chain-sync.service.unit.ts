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

  it('gets sync status from service', async () => {
    const mockedSyncStatusDataService = mockSyncStatusDataService();

    const bestSyncedBlock = new SyncStatusModel();
    bestSyncedBlock.rskBlockHeight = 666;
    bestSyncedBlock.rskBlockHash = "0xbe57";
    bestSyncedBlock.rskBlockParentHash = "0xdad1";
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
  });

  it('adds new block and informs observers', async () => {
    // Mock RSK and Sync statuses
    // rsk chain => [1, 2, 3]
    // sync      => [1]
    // Expected: sync should receive block # 2 only with no reorganization
    const firstBlock = new SyncStatusModel();
    firstBlock.rskBlockHeight = 1;
    firstBlock.rskBlockHash = "0x0001";
    firstBlock.rskBlockParentHash = '0x';

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
    const firstBlock = new SyncStatusModel();
    firstBlock.rskBlockHeight = 1;
    firstBlock.rskBlockHash = '0x0001';
    firstBlock.rskBlockParentHash = '0x';

    const secondBlockFromSync = new SyncStatusModel();
    secondBlockFromSync.rskBlockHeight = firstBlock.rskBlockHeight + 1;
    secondBlockFromSync.rskBlockHash = '0x0002a';
    secondBlockFromSync.rskBlockParentHash = firstBlock.rskBlockHash;

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
    const firstBlock = new SyncStatusModel();
    firstBlock.rskBlockHeight = 1;
    firstBlock.rskBlockHash = "0x0001";
    firstBlock.rskBlockParentHash = '0x';

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

});
