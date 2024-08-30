/* eslint-disable @typescript-eslint/no-floating-promises */
import mongoose from 'mongoose';
import {MongoDbDataService} from './mongodb-data.service';
import { TermsDbDataModel } from '../models';
import { TermsDataService } from './terms-data.service';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface TermsMongoModel extends mongoose.Document, TermsDbDataModel {
}

const TermsSchema = new mongoose.Schema({
  version: {type: Number, required: true},
  value:  {type: String, required: true},
});

const TermsConnector = mongoose.model<TermsMongoModel>("Terms", TermsSchema);

export class TermsMongoDbDataService extends MongoDbDataService<TermsDbDataModel, TermsMongoModel> implements TermsDataService {
  protected getByIdFilter(id: any) {
    throw new Error('Method not implemented.');
  }
  protected getManyFilter(filter?: any) {
    throw new Error('Method not implemented.');
  }
  protected getLoggerName(): string {
    return 'TermsMongoService';
  }
  protected getConnector(): mongoose.Model<TermsMongoModel, {}, {}> {
    this.verifyAndCreateConnectionIfIsNecessary();
    return TermsConnector;
  }
  async verifyAndCreateConnectionIfIsNecessary() {
    await this.ensureConnection();
  }
  public async getVersion(version: number): Promise<TermsDbDataModel> {
    const [document] = await this.getConnector()
    .find({ version })
    .exec();
    return document;
  }

}
