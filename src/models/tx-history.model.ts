import {model, property} from '@loopback/repository';
import {SearchableModel} from './rsk/searchable-model';

export const SOURCES = ['FLYOVER', 'SWAP', 'POWPEG', 'UNION', 'LIFI', 'SYMBIOSIS', 'teks-staging'] as const;
export type Source = (typeof SOURCES)[number];

export const TOKENS = ['BTC', 'RBTC', 'ETH', 'USDT', 'USDC', 'DAI', 'WBTC', 'BNB', 'FIAT'] as const;
export type Token = (typeof TOKENS)[number];

export const NETWORKS = ['Bitcoin', 'Rootstock', 'Ethereum', 'BNB Smart Chain', 'Lightning Network'] as const;
export type Network = (typeof NETWORKS)[number];

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
    required: false,
    jsonSchema: {
      enum: [...SOURCES],
      errorMessage: `Must be one of: ${SOURCES.join(', ')}`
    }
  })
  liquidityProviderName?: Source;

  getId() {
    return this.txHash;
  }
  getIdFieldName(): string {
    return 'txHash';
  }
}