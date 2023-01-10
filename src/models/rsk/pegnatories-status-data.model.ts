import {SearchableModel} from './searchable-model';

export class PegnatoriesStatusDataModel implements SearchableModel {
  txHash: string;
  blockNumber: number;
  blockHash: string;
  pegnatoryAddress: string;
  signature: string;
  createdOn: Date;

  constructor(
    txHash: string,
    blockNumber: number,
    blockHash: string,
    pegnatoryAddress: string,
    signature: string,
    createdOn: Date,
  ) {
    this.txHash = txHash;
    this.blockNumber = blockNumber;
    this.blockHash = blockHash;
    this.pegnatoryAddress = pegnatoryAddress;
    this.signature = signature;
    this.createdOn = createdOn;
  }

  getId() {
    return this.txHash;
  }
  getIdFieldName(): string {
    return 'txHash';
  }
}
