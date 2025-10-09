import {model, property} from '@loopback/repository';
import {SearchableModel} from './rsk/searchable-model';

export const SOURCES = ['FLYOVER', 'SWAP', 'POWPEG'] as const;
export type Source = (typeof SOURCES)[number];

@model()
export class TxHistory implements SearchableModel {
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^(0x[a-fA-F0-9]{40}|[13mn][a-km-zA-HJ-NP-Z1-9]{25,34}|2[a-km-zA-HJ-NP-Z1-9]{25,34}|(bc1q|tb1q)[0-9a-z]{38,59}|(bc1p|tb1p)[0-9a-z]{39,59})$',
      errorMessage: 'Must be a valid RSK or BTC address'
    }
  })
  userAddress: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64})$',
      errorMessage: 'Must be a valid transaction hash'
    }
  })
  txHash: string;
  
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[a-zA-Z0-9_-]+$',
      minLength: 1,
      maxLength: 256,
      errorMessage: 'Must contain only alphanumeric characters, hyphens, and underscores (no spaces)'
    }
  })
  providerHash: string;
  
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[a-zA-Z]+$',
      minLength: 1,
      maxLength: 20,
      errorMessage: 'Must contain only letters'
    }
  })
  fromTokenName: string;
  
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[a-zA-Z]+$',
      minLength: 1,
      maxLength: 20,
      errorMessage: 'Must contain only letters'
    }
  })
  fromNetworkName: string;
  
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[a-zA-Z]+$',
      minLength: 1,
      maxLength: 20,
      errorMessage: 'Must contain only letters'
    }
  })
  toTokenName: string;
  
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[a-zA-Z]+$',
      minLength: 1,
      maxLength: 20,
      errorMessage: 'Must contain only letters'
    }
  })
  toNetworkName: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[0-9]+(\\.[0-9]+)?$',
      errorMessage: 'Must be a valid decimal number (digits and dots only)'
    }
  })
  fromAmount: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[0-9]+(\\.[0-9]+)?$',
      errorMessage: 'Must be a valid decimal number (digits and dots only)'
    }
  })
  toAmount: string;

  @property({
    type: 'date',
    required: true,
  })
  date: Date;
  
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: ['FLYOVER', 'SWAP', 'POWPEG'],
      errorMessage: 'Must be one of: FLYOVER, SWAP, POWPEG'
    }
  })
  sdkProvider: Source;
  
  @property({
    type: 'number',
  })
  liquidityProviderId?: number;

  getId() {
    return this.txHash;
  }
  getIdFieldName() {
    return 'txHash';
  }
}