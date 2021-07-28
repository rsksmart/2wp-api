import {getLogger, Logger} from 'log4js';
import {Block} from '../models/rsk/block.model';
import {SyncStatusModel} from '../models/rsk/sync-status.model';
import {RskNodeService} from './rsk-node.service';
import {SyncStatusDataService} from './sync-status-data.service';

export interface RskChainSyncSubscriber {
  blockDeleted(block: Block): void;
  blockAdded(block: Block): void;
}

export class RskChainSyncService {
  private started: boolean;
  private logger: Logger;
  private syncStorageService: SyncStatusDataService;
  private rskNodeService: RskNodeService;
  private defaultInitialBlock: Block;
  private subscribers: Array<RskChainSyncSubscriber>;

  constructor(
    syncStorageService: SyncStatusDataService,
    rskNodeService: RskNodeService,
    defaultInitialBlock: Block
  ) {
    this.syncStorageService = syncStorageService;
    this.rskNodeService = rskNodeService;
    this.defaultInitialBlock = defaultInitialBlock;
    this.subscribers = [];

    this.logger = getLogger('rskChainSyncService');
  }

  private async deleteOldBlock(block: SyncStatusModel): Promise<void> {
    await this.syncStorageService.delete(block);

    let deletedBlock = new Block(
      block.rskBlockHeight,
      block.rskBlockHash,
      block.rskBlockParentHash
    );
    this.subscribers.forEach(s => s.blockDeleted(deletedBlock));
  }

  private async addNewBlocks(blocksToAdd: Array<Block>): Promise<void> {
    if (!blocksToAdd) {
      return;
    }
    while (blocksToAdd.length > 0) {
      let blockToAdd = <Block>(blocksToAdd.pop());

      await this.syncStorageService.set(this.blockToSyncStatusDataModel(blockToAdd));

      this.subscribers.forEach(s => s.blockAdded(blockToAdd));
    }
  }

  private blockToSyncStatusDataModel(block: Block): SyncStatusModel {
    let result = new SyncStatusModel();
    result.rskBlockHeight = block.height;
    result.rskBlockHash = block.hash;
    result.rskBlockParentHash = block.parentHash;

    return result;
  }

  public start(): Promise<void> {
    let p = Promise.resolve();
    if (!this.started) {
      p.then(() => this.syncStorageService.start());
      p.then(() => {
        this.started = true;
        this.logger.trace('Service started');
      });
    }
    return p;
  }

  public stop(): Promise<void> {
    let p = Promise.resolve();
    if (this.started) {
      p.then(() => this.syncStorageService.stop());
      p.then(() => {
        this.started = false;
        this.logger.trace('Service stopped');
      });
    }
    return p;
  }

  public getSyncStatus(): Promise<SyncStatusModel> {
    let p = Promise.resolve();
    if (!this.started) {
      p.then(() => this.start());
    }
    return p.then(() => {
      return this.syncStorageService.getBestBlock().then(result => {
        if (!result) {
          this.logger.debug(
            'No sync data on storage! starting from default height',
            this.defaultInitialBlock.toString()
          );
          // TODO: should I store this and notify subscribers?
          let syncStatusModel = this.blockToSyncStatusDataModel(this.defaultInitialBlock);
          return syncStatusModel;
        }
        return <SyncStatusModel>result;
      });
    });
  }

  public async sync(): Promise<void> {
    let dbBestBlock = await this.getSyncStatus();

    // TODO: ADD MIN DEPTH CONFIG

    let nextBlock = Block.fromWeb3Block(await this.rskNodeService.getBlock(dbBestBlock.rskBlockHeight + 1, false));
    let blocksToAdd: Array<Block> = [];

    while (dbBestBlock.rskBlockHash != nextBlock.parentHash) {
      // Stack to insert new block on db
      blocksToAdd.push(nextBlock);
      // Delete forked block
      await this.deleteOldBlock(dbBestBlock);
      // Go back until finding the split point
      dbBestBlock = await this.syncStorageService.getById(dbBestBlock.rskBlockParentHash);
      nextBlock = Block.fromWeb3Block(await this.rskNodeService.getBlock(nextBlock.height - 1, false));
    }

    if (blocksToAdd.length == 0) {
      // No elements, this means no fork, just add the next block
      blocksToAdd.push(nextBlock);
    } else {
      // There was a fork
      this.logger.debug(`There was a fork on the network with depth ${blocksToAdd.length}`);
    }

    // Add the blocks from the oldest to the newest
    await this.addNewBlocks(blocksToAdd);
  }

  public subscribe(subscriber: RskChainSyncSubscriber): void {
    this.subscribers.push(subscriber);
  }

  public unsubscribe(subscriber: RskChainSyncSubscriber): void {
    let idx = this.subscribers.findIndex((s) => s === subscriber);
    if (idx != -1) {
      this.subscribers.splice(idx, 1);
    }
  }

}
