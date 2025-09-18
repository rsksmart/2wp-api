import {Model, model, property} from '@loopback/repository';

@model()
export class FireblocksGenericRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
  apiKey: string;

  @property({
    type: 'string',
    required: true,
  })
  jwt: string;

  @property({
    type: 'string',
    required: true,
  })
  uri: string;

  @property({
    type: 'object',
    required: false,
  })
  bodyData?: object;

  constructor(data?: Partial<FireblocksGenericRequest>) {
    super(data);
  }
}
