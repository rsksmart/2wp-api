import {model, property} from '@loopback/repository';
import {BTC_OR_EVM_ADDRESS_PATTERN} from '../utils/address-patterns';
import {SearchableModel} from './rsk/searchable-model';

export const SOURCES = ['FLYOVER', 'SWAP', 'POWPEG', 'UNION', 'LIFI', 'SYMBIOSIS'] as const;
export type Source = (typeof SOURCES)[number];

export const TOKENS = ['BTC', 'RBTC'] as const;
export type Token = (typeof TOKENS)[number];

export const NETWORKS = ['Bitcoin', 'Rootstock'] as const;
export type Network = (typeof NETWORKS)[number];

@model()
export class TxHistory implements SearchableModel {
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: BTC_OR_EVM_ADDRESS_PATTERN,
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
      enum: [...TOKENS],
      errorMessage: 'Must be one of: BTC, RBTC'
    }
  })
  fromTokenName: Token;
  
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [...NETWORKS],
      errorMessage: 'Must be one of: Bitcoin, Rootstock'
    }
  })
  fromNetworkName: Network;
  
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [...TOKENS],
      errorMessage: `Must be one of: ${TOKENS.join(', ')}`
    }
  })
  toTokenName: Token;
  
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      enum: [...NETWORKS],
      errorMessage: `Must be one of: ${NETWORKS.join(', ')}`
    }
  })
  toNetworkName: Network;

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
      enum: [...SOURCES],
      errorMessage: `Must be one of: ${SOURCES.join(', ')}`
    }
  })
  sdkProvider: Source;
  
  @property({
    type: 'string',
  })
  liquidityProviderName?: string;

  getId() {
    return this.txHash;
  }
  getIdFieldName(): string {
    return 'txHash';
  }
}