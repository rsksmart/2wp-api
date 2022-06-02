import { SearchableModel } from './searchable-model';

export enum PegoutStatus {
  RECEIVED = 'RECEIVED',
  REJECTED = 'REJECTED',
  CREATED = 'CREATED',
  WAITING_FOR_CONFIRMATION = 'WAITING_FOR_CONFIRMATION',
  WAITING_FOR_SIGNATURE = 'WAITING_FOR_SIGNATURE',
  SIGNED = 'SIGNED',
  NOT_FOUND = 'NOT_FOUND',
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

export class PegoutStatusAppDataModel implements PegoutStatusDataModel{
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
  createdOn:Date;
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
  getId() {
    return this.rskTxHash;
  }
  getIdFieldName(): string {
    return 'rskTxHash';
  }
}
