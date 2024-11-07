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
    type: 'number',
    required: true,
  })
  value: number;

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
    type: 'number',
  })
  fee?: number;

  @property({
    type: 'number',
  })
  rskGas?: number;

  @property({
    type: 'number',
  })
  btcEstimatedFee?: number;

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
  
  constructor(data?: Partial<RegisterPayload>) { //NOSONAR
    super(data);
  }
}
