import {PeginStatusDataModel} from '../../models/rsk/pegin-status-data.model';
import {GenericDataService} from '../generic-data-service';

export interface PeginStatusDataService
  extends GenericDataService<PeginStatusDataModel> {
  deleteByRskBlockHeight(rskBlockHeight: number): Promise<boolean>;
}
