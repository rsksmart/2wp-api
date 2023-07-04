import mongoose from 'mongoose';
import {PegoutStatus, PegoutStatusDbDataModel} from '../../models/rsk/pegout-status-data-model';
import {MongoDbDataService} from '../mongodb-data.service';
import {PegoutStatusDataService} from './pegout-status-data.service';

/*
- THESE MODEL INTERFACES AND CLASSES ARE REQUIRED FOR MONGO BUT WE DON'T WANT THEM EXPOSED OUT OF THIS LAYER
*/
interface PegoutStatusMongoModel extends mongoose.Document, PegoutStatusDbDataModel {
}

const PegoutStatusSchema = new mongoose.Schema({
  originatingRskTxHash: {type: String, required: true},
  rskTxHash: {type: String, required: true, unique: true},
  rskSenderAddress: {type: String, required: true},
  btcRecipientAddress: {type: String, required: true},
  valueRequestedInSatoshis: {type: Number, required: true},
  valueInSatoshisToBeReceived: {type: Number, required: true},
  feeInSatoshisToBePaid: {type: Number, required: true},
  btcRawTransaction: {type: String, required: true},
  status: {type: String, required: true, enum: Object.values(PegoutStatus)},
  createdOn: {type: Date, required: true},
  rskBlockHeight: {type: Number, required: true},
  originatingRskBlockHeight: {type: Number, required: true},
  isNewestStatus: {type: Boolean, required: true},
  originatingRskBlockHash: {type: String, required: true},
  rskBlockHash: {type: String, required: true},
  btcRawTxInputsHash: {type: String},
  batchPegoutIndex: {type: String},
  batchPegoutRskTxHash: {type: Number},
  changedByEvent: {type: String},
  updatedAt: {type: Date},
});

const PegoutStatusConnector = mongoose.model<PegoutStatusMongoModel>("PegoutStatus", PegoutStatusSchema);

export class PegoutStatusMongoDbDataService extends MongoDbDataService<PegoutStatusDbDataModel, PegoutStatusMongoModel> implements PegoutStatusDataService {

  protected getLoggerName(): string {
    return 'pegoutStatusMongoService';
  }
  protected getConnector(): mongoose.Model<PegoutStatusMongoModel, {}, {}> {
    this.verifyAndCreateConnectionIfIsNecessary();
    return PegoutStatusConnector;
  }
  async verifyAndCreateConnectionIfIsNecessary() {
    await this.ensureConnection();
  }
  protected getByIdFilter(id: any) {
    return {rskTxHash: id};
  }
  protected getManyFilter(filter?: any) {
    return filter;
  }

  public deleteByRskBlockHeight(rskBlockHeight: number): Promise<boolean> {
    return this.getConnector()
      .deleteMany({rskBlockHeight: rskBlockHeight})
      .exec()
      .then(() => true);
  }

  public async getManyByOriginatingRskTxHash(originatingRskTxHash: string): Promise<PegoutStatusDbDataModel[]> {
    const pegoutsDocuments = await this.getConnector()
    .find({originatingRskTxHash})
    .exec();
    return pegoutsDocuments.map(PegoutStatusDbDataModel.clonePegoutStatusInstance);
  }

  public async getLastByOriginatingRskTxHash(originatingRskTxHash: string): Promise<PegoutStatusDbDataModel | null> {
    const pegoutDocument = await this.getConnector()
    .find({originatingRskTxHash})
    .sort({createdOn: -1})
    .limit(1)
    .exec()
    .then((pegoutStatuses: PegoutStatusDbDataModel[]) => pegoutStatuses[0] || null);
    if(!pegoutDocument) {
      return null;
    }
    // Getting the pegout status from the db does not create a PegoutStatusDataModel instance.
    // So the data that the db returns does not have the 'getIdFieldName' method,
    // which is needed to be able to update and safe the pegout status.
    // That's why we need to 'clone' it here, to create an actual PegoutStatusDataModel instance and have what we need.
    // Same for the other uses of this clone method in this file.
    return PegoutStatusDbDataModel.clonePegoutStatusInstance(pegoutDocument);
  }

  public async getLastByOriginatingRskTxHashNewest(originatingRskTxHash: string): Promise<PegoutStatusDbDataModel | null> {
    const pegoutDocument = await this.getConnector()
    .find({originatingRskTxHash, isNewestStatus: true})
    .sort({createdOn: -1})
    .limit(1)
    .exec()
    .then((pegoutStatuses: PegoutStatusDbDataModel[]) => pegoutStatuses[0] || null);
    if(!pegoutDocument) {
      return null;
    }
    return PegoutStatusDbDataModel.clonePegoutStatusInstance(pegoutDocument);
  }

  public async getAllNotFinishedByBtcRecipientAddress(btcRecipientAddress: string): Promise<PegoutStatusDbDataModel[]> {
    const isNewestStatus = true;
    const pegoutDocuments = await this.getConnector()
    .find({status: {$ne: PegoutStatus.RELEASE_BTC}, isNewestStatus, btcRecipientAddress})
    .exec();
    return pegoutDocuments.map(PegoutStatusDbDataModel.clonePegoutStatusInstance);
  }

  public async getManyWaitingForConfirmationNewest(): Promise<PegoutStatusDbDataModel[]> {
    const pegoutsDocuments = await this.getConnector()
    .find({status: PegoutStatus.WAITING_FOR_CONFIRMATION, isNewestStatus: true})
    .exec();
    return pegoutsDocuments.map(PegoutStatusDbDataModel.clonePegoutStatusInstance);
  }

  public async getManyWaitingForConfirmationNewestCreatedOnBlock(block: number): Promise<PegoutStatusDbDataModel[]> {
    const pegoutsDocuments = await this.getConnector()
    .find({status: PegoutStatus.WAITING_FOR_CONFIRMATION, isNewestStatus: true, rskBlockHeight: block})
    .exec();
    return pegoutsDocuments.map(PegoutStatusDbDataModel.clonePegoutStatusInstance);
  }

  public async getManyWaitingForSignaturesNewest(): Promise<PegoutStatusDbDataModel[]> {
    const pegoutsDocuments = await  this.getConnector()
    .find({status: PegoutStatus.WAITING_FOR_SIGNATURE, isNewestStatus: true})
    .exec();
    return pegoutsDocuments.map(PegoutStatusDbDataModel.clonePegoutStatusInstance);
  }

  public async getManyByRskTxHashes(rskTxHashes: Array<string>): Promise<PegoutStatusDbDataModel[]> {
    const pegoutsDocuments = await  this.getConnector()
    .find({rskTxHash: { $in: rskTxHashes }})
    .exec();
    return pegoutsDocuments.map(PegoutStatusDbDataModel.clonePegoutStatusInstance);
  }

  public async getManyByBtcRawTxInputsHashNewest(btcRawTxInputsHash: string): Promise<PegoutStatusDbDataModel[]> {
    const pegoutsDocuments = await  this.getConnector()
    .find({btcRawTxInputsHash, isNewestStatus: true})
    .exec();
    return pegoutsDocuments.map(PegoutStatusDbDataModel.clonePegoutStatusInstance);
  }

}
