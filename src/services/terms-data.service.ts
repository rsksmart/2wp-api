import { GenericDataService } from './generic-data-service';
import { TermsDbDataModel } from '../models';

export interface TermsDataService extends GenericDataService<TermsDbDataModel> {
  getVersion(version: number): Promise<TermsDbDataModel>;
}
