import {SyncStatusModel} from '../models/rsk/sync-status.model';
import {GenericDataService} from './generic-data-service';

export interface SyncStatusDataService
  extends GenericDataService<SyncStatusModel> {
  getBestBlock(): Promise<SyncStatusModel | undefined>;
}
