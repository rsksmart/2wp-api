import {Model, model, property} from '@loopback/repository';
import { QuoteDbModel } from './quote-db.model';

@model()
export class RegisterPayload extends Model {
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^(0x[a-fA-F0-9]{64}|[a-fA-F0-9]{64}|[a-zA-Z0-9]+)$',
      errorMessage: 'Must be a valid transaction hash or provider identifier'
    }
  })
  txHash: string;

  @property({
    type: 'string',
    required: true,
  })
  type: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^[0-9]+$',
      errorMessage: 'Must be a valid number (digits only, no negative)'
    }
  })
  value: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      pattern: '^(0x[a-fA-F0-9]{40}|[13mn][a-km-zA-HJ-NP-Z1-9]{25,34}|2[a-km-zA-HJ-NP-Z1-9]{25,34}|(bc1q|tb1q)[0-9a-z]{38,59}|(bc1p|tb1p)[0-9a-z]{39,59})$',
      errorMessage: 'Must be a valid wallet address'
    }
  })
  wallet: string;

  @property({
    type: 'string',
  })
  addressType?: string;

  @property({
    type: 'string',
  })
  fee?: string;

  @property({
    type: 'string',
  })
  rskGas?: string;

  @property({
    type: 'string',
  })
  btcEstimatedFee?: string;

  @property({
    type: 'string',
  })
  provider?: string;

  @property({
    type: 'object',
  })
  details?: Record<string, any>;

  @property({
    type: 'string',
  })
  quoteHash?: string;

  @property({
    type: 'object',
  })
  quote?: QuoteDbModel;

  @property({
    type: 'string',
  })
  acceptedQuoteSignature?: string;
  
  constructor(data?: Partial<RegisterPayload>) { //NOSONAR
    super(data);
  }
}
