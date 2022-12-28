import { PegoutStatusDbDataModel } from '../../models/rsk/pegout-status-data-model';
import {GenericDataService} from '../generic-data-service';

export interface PegoutStatusDataService extends GenericDataService<PegoutStatusDbDataModel> {
  deleteByRskBlockHeight(rskBlockHeight: number): Promise<boolean>;
  getManyByOriginatingRskTxHash(originatingRskTxHash: string): Promise<PegoutStatusDbDataModel[]>;
  getLastByOriginatingRskTxHash(originatingRskTxHash: string): Promise<PegoutStatusDbDataModel | null>;
  getManyWaitingForConfirmationNewest(): Promise<PegoutStatusDbDataModel[]>;
  getManyWaitingForSignaturesNewest(): Promise<PegoutStatusDbDataModel[]>;
  getManyByRskTxHashes(originatingRskTxHashes: Array<string>): Promise<PegoutStatusDbDataModel[]>;
  getManyByBtcRawTxInputsHashNewest(btcRawTxInputsHash: string): Promise<PegoutStatusDbDataModel[]>;
  getByRskTxNewest(rskTransactionHash: string): Promise<PegoutStatusDbDataModel[]>;
}
