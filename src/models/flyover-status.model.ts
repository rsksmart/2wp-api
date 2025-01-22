import { QuoteDbModel } from './quote-db.model';
import {SearchableModel} from './rsk/searchable-model';

export enum FlyoverStatuses {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
}
export class FlyoverStatusModel implements SearchableModel {
  txHash: string;
  type: string;
  date: Date;
  amount: number;
  fee: number;
  blockToBeFinished: number;
  senderAddress: string;
  recipientAddress: string;
  quoteHash: string;
  quote: QuoteDbModel;
  acceptedQuoteSignature: string;
  status?: FlyoverStatuses;

  getId() {
    return this.txHash;
  }
  getIdFieldName(): string {
    return 'txHash';
  }

  constructor(data?: Partial<FlyoverStatusModel>) {
    Object.assign(this, data);
  }

  static clone(other:FlyoverStatusModel): FlyoverStatusModel {
    const copy =  new FlyoverStatusModel();
    copy.txHash = other.txHash;
    copy.type = other.type;
    copy.date = other.date;
    copy.amount = other.amount;
    copy.fee = other.fee;
    copy.blockToBeFinished = other.blockToBeFinished;
    copy.senderAddress = other.senderAddress;
    copy.recipientAddress = other.recipientAddress;
    copy.quoteHash = other.quoteHash;
    copy.acceptedQuoteSignature = other.acceptedQuoteSignature;
    copy.status = other.status;
    return copy;
  }
}