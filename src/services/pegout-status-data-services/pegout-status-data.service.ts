import { PegoutStatusDataModel } from '../../models/rsk/pegout-status-data.model';
import {GenericDataService} from '../generic-data-service';

export interface PegoutStatusDataService extends GenericDataService<PegoutStatusDataModel> {
  deleteByRskBlockHeight(rskBlockHeight: number): Promise<boolean>;
  getManyByOriginatingRskTxHash(originatingRskTxHash: string): Promise<PegoutStatusDataModel[]>;
  getLastByOriginatingRskTxHash(originatingRskTxHash: string): Promise<PegoutStatusDataModel | null>;
}
