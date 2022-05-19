import { SearchableModel } from './searchable-model';

export enum PegoutStatus {
  RECEIVED = 'RECEIVED',
  REJECTED = 'REJECTED',
  CREATED = 'CREATED',
  WAITING_FOR_CONFIRMATION = 'WAITING_FOR_CONFIRMATION',
  WAITING_FOR_SIGNATURE = 'WAITING_FOR_SIGNATURE',
  SIGNED = 'SIGNED',
  NOT_FOUND = 'NOT_FOUND',
}

export class PegoutStatusDataModel {
  constructor(data?: Partial<PegoutStatusDataModel>) {
    Object.assign(this, data);
  }

  static fromPegoutStatusDbDataModell(model: PegoutStatusDbDataModel):PegoutStatusDataModel {
    const { rskTxHash,
      rskSenderAddress,
      btcRecipientAddress,
      valueRequestedInSatoshis,
      valueInSatoshisToBeReceived,
      feeInSatoshisToBePaid,
      status,
      btcRawTransaction,
    } = model;
    return new PegoutStatusDataModel({
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
}

export class PegoutStatusDbDataModel extends PegoutStatusDataModel implements SearchableModel {
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
