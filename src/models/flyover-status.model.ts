import { QuoteDbModel } from './quote-db.model';
import {SearchableModel} from './rsk/searchable-model';

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

  getId() {
    return this.txHash;
  }
  getIdFieldName(): string {
    return 'txHash';
  }
}