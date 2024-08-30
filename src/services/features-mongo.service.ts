/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-floating-promises */
import mongoose from 'mongoose';
import { FeaturesDataService } from './features-data.service';
import {FeaturesDbDataModel} from '../models/features-data.model';
import {MongoDbDataService} from './mongodb-data.service';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface FeaturesMongoModel extends mongoose.Document, FeaturesDbDataModel {
}

const FeaturesSchema = new mongoose.Schema({
  creationDate: {type: Date},
  lastUpdateDate: {type: Date},
  name:  {type: String, required: true},
  enabled:  {type: Boolean, required: true},
  version: {type: Number, required: true},
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
  public async getAll(): Promise<FeaturesDbDataModel[]> {
    const documents = await this.getConnector()
    .find({})
    .exec();
    return documents.map(FeaturesDbDataModel.clone);
  }

}
