import {Model, model, property} from '@loopback/repository';
import { QuoteDbModel } from './quote-db.model';

@model()
export class RegisterPayload extends Model {
  @property({
    type: 'string',
    required: true,
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
  })
  value: string;

  @property({
    type: 'string',
    required: true,
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
