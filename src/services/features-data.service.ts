import { GenericDataService } from './generic-data-service';
import { FeaturesDbDataModel } from '../models/features-data.model';

export interface FeaturesDataService extends GenericDataService<FeaturesDbDataModel> {
  getAll(): Promise<FeaturesDbDataModel[]>;
}
