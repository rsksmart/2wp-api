/* eslint-disable @typescript-eslint/naming-convention */
import { SearchableModel } from './searchable-model';

// eslint-disable-next-line no-shadow
export enum PegoutStatus {
  RECEIVED = 'RECEIVED',
  REJECTED = 'REJECTED',
  WAITING_FOR_CONFIRMATION = 'WAITING_FOR_CONFIRMATION',
  WAITING_FOR_SIGNATURE = 'WAITING_FOR_SIGNATURE',
  SIGNED = 'SIGNED',
  NOT_FOUND = 'NOT_FOUND',
  PENDING = 'PENDING',
  NOT_PEGOUT_TX = 'NOT_PEGOUT_TX'
}

export interface PegoutStatusDataModel {
  originatingRskTxHash: string;
  rskTxHash: string;
  rskSenderAddress: string;
  btcRecipientAddress: string;
  valueRequestedInSatoshis: number;
  valueInSatoshisToBeReceived: number;
  feeInSatoshisToBePaid: number;
  status: PegoutStatus;
  btcRawTransaction: string;
}

export class PegoutStatusAppDataModel implements PegoutStatusDataModel {
  constructor(data?: Partial<PegoutStatusAppDataModel>) {
    Object.assign(this, data);
  }

  static fromPegoutStatusDataModel(model: PegoutStatusDataModel):PegoutStatusAppDataModel {
    const {
      originatingRskTxHash,
      rskTxHash,
      rskSenderAddress,
      btcRecipientAddress,
      valueRequestedInSatoshis,
      valueInSatoshisToBeReceived,
      feeInSatoshisToBePaid,
      status,
      btcRawTransaction,
    } = model;
    return new PegoutStatusAppDataModel({
      originatingRskTxHash,
      rskTxHash,
      rskSenderAddress,
      btcRecipientAddress,
      valueRequestedInSatoshis,
      valueInSatoshisToBeReceived,
      feeInSatoshisToBePaid,
      status,
      btcRawTransaction,
    });
  }
  rskTxHash: string;
  rskSenderAddress: string;
  btcRecipientAddress: string;
  valueRequestedInSatoshis: number;
  valueInSatoshisToBeReceived: number;
  feeInSatoshisToBePaid: number;
  status: PegoutStatus;
  btcRawTransaction: string;
  originatingRskTxHash: string;
  createdOn: Date;
}

export class PegoutStatusDbDataModel implements SearchableModel, PegoutStatusDataModel {
  rskTxHash: string;
  rskSenderAddress: string;
  btcRecipientAddress: string;
  valueRequestedInSatoshis: number;
  valueInSatoshisToBeReceived: number;
  feeInSatoshisToBePaid: number;
  status: PegoutStatus;
  btcRawTransaction: string;
  originatingRskTxHash: string; // First pegout rskTxHash, the one the user should have.
  rskBlockHeight: number;
  reason: string;
  createdOn: Date;
  btcTxHash: string;
  originatingRskBlockHeight: number;
  isNewestStatus: boolean;
  originatingRskBlockHash: string;
  rskBlockHash: string;
  getId() {
    return this.rskTxHash;
  }
  getIdFieldName(): string {
    return 'rskTxHash';
  }

  public static clonePegoutStatusInstance(pegoutStatus: PegoutStatusDbDataModel): PegoutStatusDbDataModel {
    const pegoutStatusInstance: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();
    pegoutStatusInstance.btcRecipientAddress = pegoutStatus.btcRecipientAddress; 
    pegoutStatusInstance.originatingRskTxHash = pegoutStatus.originatingRskTxHash;
    pegoutStatusInstance.valueRequestedInSatoshis = pegoutStatus.valueRequestedInSatoshis;
    pegoutStatusInstance.rskSenderAddress = pegoutStatus.rskSenderAddress;
    pegoutStatusInstance.rskTxHash = pegoutStatus.rskTxHash;
    pegoutStatusInstance.rskBlockHeight = pegoutStatus.rskBlockHeight;
    pegoutStatusInstance.createdOn = pegoutStatus.createdOn;
    pegoutStatusInstance.btcTxHash = pegoutStatus.btcTxHash;
    pegoutStatusInstance.originatingRskBlockHeight = pegoutStatus.originatingRskBlockHeight;
    pegoutStatusInstance.isNewestStatus = pegoutStatus.isNewestStatus;
    pegoutStatusInstance.status = pegoutStatus.status;
    pegoutStatusInstance.btcRawTransaction = pegoutStatus.btcRawTransaction;
    pegoutStatusInstance.reason = pegoutStatus.reason;
    pegoutStatusInstance.valueInSatoshisToBeReceived = pegoutStatus.valueInSatoshisToBeReceived;
    pegoutStatusInstance.feeInSatoshisToBePaid = pegoutStatus.feeInSatoshisToBePaid;
    pegoutStatusInstance.originatingRskBlockHash = pegoutStatus.originatingRskBlockHash;
    pegoutStatusInstance.rskBlockHash = pegoutStatus.rskBlockHash;
    return pegoutStatusInstance;
  }

}
