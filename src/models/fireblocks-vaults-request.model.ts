import {Model, model, property} from '@loopback/repository';

@model()
export class FireblocksVaultsRequest extends Model {
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
  options: object;

  constructor(data?: Partial<FireblocksVaultsRequest>) {
    super(data);
  }
}
