import {SearchableModel} from './searchable-model';

export class SyncStatusModel implements SearchableModel {
  syncId: number;
  rskBlockHeight: number;
  lastSyncedOn: Date;

  getId(): any {
    return this.syncId;
  }

  getIdFieldName(): string {
    return 'syncId';
  }
}
