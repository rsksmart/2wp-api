import {model, property} from '@loopback/repository';
import {SearchableModel} from './rsk/searchable-model';

export const SOURCES = ['FLYOVER', 'SWAP', 'POWPEG'] as const;
export type Source = (typeof SOURCES)[number];

@model()
export class TxHistory implements SearchableModel {
  @property({
    type: 'string',
    required: true,
  })
  userAddress: string;
  
  @property({
    type: 'string',
    required: true,
  })
  providerHash: string;
  
  @property({
    type: 'string',
    required: true,
  })
  fromToken: string;
  
  @property({
    type: 'string',
    required: true,
  })
  fromNetwork: string;
  
  @property({
    type: 'string',
    required: true,
  })
  toToken: string;
  
  @property({
    type: 'string',
    required: true,
  })
  toNetwork: string;
  
  @property({
    type: 'date',
    required: true,
  })
  date: Date;
  
  @property({
    type: 'string',
    required: true,
  })
  sdkProvider: Source;
  
  @property({
    type: 'number',
  })
  liquidityProviderId?: number;

  getId() {
    return this.providerHash;
  }
  getIdFieldName() {
    return 'providerHash';
  }
}