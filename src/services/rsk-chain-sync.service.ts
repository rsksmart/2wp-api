/* eslint-disable @typescript-eslint/no-floating-promises */
import {inject} from '@loopback/core';
import {getLogger, Logger} from '../utils/logger';
import {ConstantsBindings, ServicesBindings} from '../dependency-injection-bindings';
import {RskBlock} from '../models/rsk/rsk-block.model';
import {SyncStatusModel} from '../models/rsk/sync-status.model';
import {RskNodeService} from './rsk-node.service';
import {SyncStatusDataService} from './sync-status-data.service';

export interface RskChainSyncSubscriber {
  blockDeleted(block: RskBlock): Promise<void>;
  blockAdded(block: RskBlock): void;
}

export class RskChainSyncService {
  private started: boolean;
  private logger: Logger;
  private syncStorageService: SyncStatusDataService;
  private rskNodeService: RskNodeService;
  private defaultInitialBlock: RskBlock;
  private subscribers: Array<RskChainSyncSubscriber>;
  private minDepthForSync: number;

  constructor(
    @inject(ServicesBindings.SYNC_STATUS_DATA_SERVICE)
    syncStorageService: SyncStatusDataService,
    @inject(ServicesBindings.RSK_NODE_SERVICE)
    rskNodeService: RskNodeService,
    @inject(ConstantsBindings.INITIAL_BLOCK)
    defaultInitialBlock: RskBlock,
    @inject(ConstantsBindings.MIN_DEPTH_FOR_SYNC)
    minDepthForSync: number
  ) {
    this.syncStorageService = syncStorageService;
    this.rskNodeService = rskNodeService;
    this.defaultInitialBlock = defaultInitialBlock;
    this.minDepthForSync = minDepthForSync;
    this.subscribers = [];

    this.logger = getLogger('rskChainSyncService');
  }

  private async deleteOldBlock(block: SyncStatusModel): Promise<void> {
    this.logger.debug({method: 'deleteOldBlock', blockHeight: block.rskBlockHeight, blockHash: block.rskBlockHash}, 'Going to delete block');

    const deletedBlock = new RskBlock(
      block.rskBlockHeight,
      block.rskBlockHash,
      block.rskBlockParentHash
    );

    // Clean up subscriber data (pegout status rows) for the deleted block before removing
    // its sync pointer. Otherwise a failed cleanup leaves the pointer gone with no retry path.
    await Promise.all(this.subscribers.map(s => s.blockDeleted(deletedBlock)));

    await this.syncStorageService.delete(block.rskBlockHash);
  }

  private async addNewBlocks(blocksToAdd: Array<RskBlock>): Promise<void> {
    this.logger.debug({method: 'addNewBlocks', count: blocksToAdd.length}, 'Going to add blocks');
    while (blocksToAdd.length > 0) {
      const blockToAdd = <RskBlock>(blocksToAdd.pop());

      this.logger.debug({method: 'addNewBlocks', blockHeight: blockToAdd.height, blockHash: blockToAdd.hash}, 'Going to add block');
      await this.syncStorageService.set(this.blockToSyncStatusDataModel(blockToAdd));

      this.subscribers.forEach(s => s.blockAdded(blockToAdd));
    }
  }

  private blockToSyncStatusDataModel(block: RskBlock): SyncStatusModel {
    return new SyncStatusModel(block.hash, block.height, block.parentHash);
  }

  public start(): Promise<void> {
    const p = Promise.resolve();
    if (!this.started) {
      p.then(() => this.syncStorageService.start());
      p.then(() => {
        this.started = true;
        this.logger.debug({method: 'start'}, 'Service started');
      });
    }
    return p;
  }

  public stop(): Promise<void> {
    const p = Promise.resolve();
    if (this.started) {
      p.then(() => this.syncStorageService.stop());
      p.then(() => {
        this.started = false;
        this.logger.debug({method: 'stop'}, 'Service stopped');
      });
    }
    return p;
  }

  public getSyncStatus(): Promise<SyncStatusModel> {
    const p = Promise.resolve();
    if (!this.started) {
      p.then(() => this.start());
    }
    return p.then(() => {
      return this.syncStorageService.getBestBlock().then(result => {
        if (!result) {
          this.logger.debug(
            {defaultInitialBlock: this.defaultInitialBlock.toString()},
            'No sync data on storage! starting from default height',
          );
          // TODO: should I store this and notify subscribers?
          const syncStatusModel = this.blockToSyncStatusDataModel(this.defaultInitialBlock);
          return syncStatusModel;
        }
        return <SyncStatusModel>result;
      });
    });
  }

  public async sync(): Promise<void> {
    let dbBestBlock = await this.getSyncStatus();
    const rskBestBlock = RskBlock.fromWeb3Block(await this.rskNodeService.getBlock('latest'));
    // In case the db is synced with a forked chain and that forked chain is longer than the main chain,
    // remove all extra forked blocks from the db + 1 as an offset so the following logic handles it appropriately.
    if(rskBestBlock.height < dbBestBlock.rskBlockHeight) {
      this.logger.debug({method: 'sync', mainChainHeight: rskBestBlock.height, syncedHeight: dbBestBlock.rskBlockHeight}, 'Main chain is shorter than synced chain');
      let countOfBlocksToRemove = dbBestBlock.rskBlockHeight - rskBestBlock.height + this.minDepthForSync + 1;
      while(countOfBlocksToRemove !== 0) {
        await this.deleteOldBlock(dbBestBlock);
        dbBestBlock = await this.syncStorageService.getById(dbBestBlock.rskBlockParentHash);
        countOfBlocksToRemove--;
      }
    }

    // Only sync blocks that are buried in the configured depth
    if(dbBestBlock.rskBlockHeight >= rskBestBlock.height - this.minDepthForSync) {
      return;
    }

    this.logger.debug({method: 'sync'}, 'Found block(s) to sync');

    let nextBlock = RskBlock.fromWeb3BlockWithTransactions(await this.rskNodeService.getBlock(dbBestBlock.rskBlockHeight + 1));
    const blocksToAdd: Array<RskBlock> = [];
    // Stack to insert new block on db (new Best block)
    blocksToAdd.push(nextBlock);

    while (dbBestBlock.rskBlockHash !== nextBlock.parentHash) {
      // Delete forked block
      await this.deleteOldBlock(dbBestBlock);
      // Go back until finding the split point
      dbBestBlock = await this.syncStorageService.getById(dbBestBlock.rskBlockParentHash);
      nextBlock = RskBlock.fromWeb3BlockWithTransactions(await this.rskNodeService.getBlock(nextBlock.height - 1));
      // Include this block in the stack as well (new Reorganized block)
      blocksToAdd.push(nextBlock);
    }

    if (blocksToAdd.length > 1) {
      // There was a fork
      this.logger.debug({method: 'sync', depth: blocksToAdd.length}, 'There was a fork on the network');
    }

    // Add the blocks from the oldest to the newest
    await this.addNewBlocks(blocksToAdd);
  }

  public subscribe(subscriber: RskChainSyncSubscriber): void {
    this.subscribers.push(subscriber);
  }

  public unsubscribe(subscriber: RskChainSyncSubscriber): void {
    const idx = this.subscribers.findIndex((s) => s === subscriber);
    if (idx !== -1) {
      this.subscribers.splice(idx, 1);
    }
  }

}
