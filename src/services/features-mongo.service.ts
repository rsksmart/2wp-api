/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-floating-promises */
import mongoose from 'mongoose';
import { FeaturesDataService } from './features-data.service';
import {FeaturesDbDataModel} from '../models/features-data.model';
import {MongoDbDataService} from './mongodb-data.service';
import {MONGO_MAX_DOCUMENTS} from '../config/resource-budgets';
import {recordBudgetViolation, ResourceBudgetName} from '../utils/resource-budget';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface FeaturesMongoModel extends mongoose.Document, FeaturesDbDataModel {
}

const SupportedBrowsersSchema = new mongoose.Schema({
  chrome: {type: Boolean, required: true},
  firefox: {type: Boolean, required: true},
  edge: {type: Boolean, required: true},
  opera: {type: Boolean, required: true},
  brave: {type: Boolean, required: true},
  chromium: {type: Boolean, required: true},
  safari: {type: Boolean, required: true},
});

const FeaturesSchema = new mongoose.Schema({
  creationDate: {type: Date},
  lastUpdateDate: {type: Date},
  name:  {type: String, required: true},
  value:  {type: String, required: true},
  version: {type: Number, required: true},
  supportedBrowsers: SupportedBrowsersSchema,
});

const FeaturesConnector = mongoose.model<FeaturesMongoModel>("Features", FeaturesSchema);

export class FeaturesMongoDbDataService extends MongoDbDataService<FeaturesDbDataModel, FeaturesMongoModel> implements FeaturesDataService {
  protected getByIdFilter(id: any) {
    throw new Error('Method not implemented.');
  }
  protected getManyFilter(filter?: any) {
    throw new Error('Method not implemented.');
  }
  protected getLoggerName(): string {
    return 'FeaturesMongoService';
  }
  protected getConnector(): mongoose.Model<FeaturesMongoModel, {}, {}> {
    this.verifyAndCreateConnectionIfIsNecessary();
    return FeaturesConnector;
  }
  async verifyAndCreateConnectionIfIsNecessary() {
    await this.ensureConnection();
  }
  /**
   * Every feature flag, bounded.
   *
   * `GET /features` is public and unauthenticated, and this was an unbounded
   * `find({})` — the one shape every other budget in this service exists to
   * remove. The collection is small and operator-managed (14 flags today), so
   * the cap is a ceiling rather than a page size: it exists so an unexpectedly
   * grown collection cannot turn a public request into unbounded memory.
   *
   * The bound is applied in the query, not to the result: capping an
   * already-materialized array would buy nothing.
   *
   * @returns The feature flags, at most `MONGO_MAX_DOCUMENTS` of them.
   */
  public async getAll(): Promise<FeaturesDbDataModel[]> {
    const documents = await this.getConnector()
    .find({})
    .limit(MONGO_MAX_DOCUMENTS)
    .exec();

    // Filling the budget means the read may have been truncated, which is worth
    // knowing: the collection outgrew the assumption behind the ceiling.
    if (documents.length >= MONGO_MAX_DOCUMENTS) {
      recordBudgetViolation({
        resource: ResourceBudgetName.MONGO_DOCUMENTS,
        configuredLimit: MONGO_MAX_DOCUMENTS,
        observedValue: documents.length,
        detail: 'features.getAll',
      });
    }
    return documents.map(FeaturesDbDataModel.clone);
  }

}
