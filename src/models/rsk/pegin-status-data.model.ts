export class PeginStatusDataModel {
  btcTxId: string;
  status: string; // TODO: this should be an enum
  rskBlockHeight: number;
  rskTxId: string;
  rskRecipient: string;
  createdOn: Date;
  // TODO: add value field => value: BigInt;
}
