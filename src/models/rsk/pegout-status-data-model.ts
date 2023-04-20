import ExtendedBridgeTx from '../../services/extended-bridge-tx';
import { SearchableModel } from './searchable-model';

export enum PegoutStatus {
  RECEIVED = 'RECEIVED',
  REJECTED = 'REJECTED',
  WAITING_FOR_CONFIRMATION = 'WAITING_FOR_CONFIRMATION',
  WAITING_FOR_SIGNATURE = 'WAITING_FOR_SIGNATURE',
  SIGNED = 'SIGNED',
  NOT_FOUND = 'NOT_FOUND',
  PENDING = 'PENDING',
  NOT_PEGOUT_TX = 'NOT_PEGOUT_TX',
  RELEASE_BTC = 'RELEASE_BTC'
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
  static fromPegoutStatusDataModelRejected(model: PegoutStatusDataModel):PegoutStatusAppDataModel {
    const {
      originatingRskTxHash,
      rskTxHash,
      rskSenderAddress,
      valueRequestedInSatoshis,
      status,
    } = model;
    return new PegoutStatusAppDataModel({
      originatingRskTxHash,
      rskTxHash,
      rskSenderAddress,
      valueRequestedInSatoshis,
      status,
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
  rskBlockHash: string;
  rskBlockHeight: number;
  rskSenderAddress: string;
  status: PegoutStatus;
  isNewestStatus: boolean;
  createdOn: Date;
  originatingRskTxHash: string; // First pegout rskTxHash, the one the user should have.
  originatingRskBlockHash: string;
  originatingRskBlockHeight: number;
  btcRecipientAddress: string;
  btcTxHash: string;
  btcRawTransaction: string;
  valueRequestedInSatoshis: number;
  valueInSatoshisToBeReceived: number;
  feeInSatoshisToBePaid: number;
  reason: string;
  btcRawTxInputsHash: string;
  batchPegoutIndex: number;
  batchPegoutRskTxHash: string;

  getId() {
    return this.rskTxHash;
  }
  getIdFieldName(): string {
    return 'rskTxHash';
  }
  setRskTxInformation(extendedBridgeTx: ExtendedBridgeTx) {
    this.rskTxHash = extendedBridgeTx.txHash;
    this.rskBlockHash = extendedBridgeTx.blockHash;
    this.rskBlockHeight = extendedBridgeTx.blockNumber;
    this.createdOn = extendedBridgeTx.createdOn;
  }

  public static clonePegoutStatusInstance(pegoutStatus: PegoutStatusDbDataModel): PegoutStatusDbDataModel {
    const pegoutStatusInstance: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();
    pegoutStatusInstance.rskTxHash = pegoutStatus.rskTxHash;
    pegoutStatusInstance.rskSenderAddress = pegoutStatus.rskSenderAddress;
    pegoutStatusInstance.btcRecipientAddress = pegoutStatus.btcRecipientAddress;
    pegoutStatusInstance.valueRequestedInSatoshis = pegoutStatus.valueRequestedInSatoshis;
    pegoutStatusInstance.valueInSatoshisToBeReceived = pegoutStatus.valueInSatoshisToBeReceived;
    pegoutStatusInstance.feeInSatoshisToBePaid = pegoutStatus.feeInSatoshisToBePaid;
    pegoutStatusInstance.status = pegoutStatus.status;
    pegoutStatusInstance.btcRawTransaction = pegoutStatus.btcRawTransaction;
    pegoutStatusInstance.originatingRskTxHash = pegoutStatus.originatingRskTxHash;
    pegoutStatusInstance.rskBlockHeight = pegoutStatus.rskBlockHeight;
    pegoutStatusInstance.reason = pegoutStatus.reason;
    pegoutStatusInstance.createdOn = pegoutStatus.createdOn;
    pegoutStatusInstance.btcTxHash = pegoutStatus.btcTxHash;
    pegoutStatusInstance.originatingRskBlockHeight = pegoutStatus.originatingRskBlockHeight;
    pegoutStatusInstance.isNewestStatus = pegoutStatus.isNewestStatus;
    pegoutStatusInstance.originatingRskBlockHash = pegoutStatus.originatingRskBlockHash;
    pegoutStatusInstance.rskBlockHash = pegoutStatus.rskBlockHash;
    pegoutStatusInstance.btcRawTxInputsHash = pegoutStatus.btcRawTxInputsHash;
    pegoutStatusInstance.batchPegoutIndex = pegoutStatus.batchPegoutIndex;
    pegoutStatusInstance.batchPegoutRskTxHash = pegoutStatus.batchPegoutRskTxHash;
    return pegoutStatusInstance;
  }

}
