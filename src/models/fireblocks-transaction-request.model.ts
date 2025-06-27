import {Model, model, property} from '@loopback/repository';

@model()
export class FireblocksTransactionRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
  apiKey: string;

  @property({
    type: 'string',
    required: true,
  })
  cert: string;

  @property({
    type: 'object',
    required: true,
  })
  payload: object;

  constructor(data?: Partial<FireblocksTransactionRequest>) {
    super(data);
  }
}
