import {PegnatoriesStatusDataModel} from '../../models/rsk/pegnatories-status-data.model';
import {GenericDataService} from '../generic-data-service';

export interface PegnatoriesStatusDataService extends GenericDataService<PegnatoriesStatusDataModel> {
  //deleteByRskBlockHeight(rskBlockHeight: number): Promise<boolean>;
}
