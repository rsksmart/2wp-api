import { PegoutStatusDataModel } from '../../models/rsk/pegout-status-data-model';
import {GenericDataService} from '../generic-data-service';

export interface PegoutStatusDataService extends GenericDataService<PegoutStatusDataModel> {
  deleteByRskBlockHeight(rskBlockHeight: number): Promise<boolean>;
}
