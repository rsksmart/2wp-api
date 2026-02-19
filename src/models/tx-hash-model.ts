import {model, property} from '@loopback/repository';
import { Network, NETWORKS } from './tx-history.model';

@model()
export class TxHashAndQuote {

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})$',
      errorMessage: 'Must be a valid transaction hash'
    }
  })
  transactionHash: string;

    @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64}|[A-Za-z0-9]{12})$',
      minLength: 1,
      maxLength: 256,
      errorMessage: 'Must be a valid transaction hash or provider identifier'
    }
  })
  providerHash: string;
   
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [...NETWORKS],
      errorMessage: 'Must be one of: Bitcoin, Rootstock'
    }
  })
  fromNetworkName: Network;

  getId() {
    return this.transactionHash;
  }
  getIdFieldName(): string {
    return 'transactionHash';
  }
}
