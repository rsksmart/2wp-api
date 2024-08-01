import {Model, model, property} from '@loopback/repository';

@model()
export class RegisterCallPayload extends Model {
  @property({
    type: 'string',
  })
  operationType?: string;

  @property({
    type: 'string',
    required: true,
  })
  functionType: string;

  @property({
    type: 'string',
    required: true,
  })
  result: string;

  constructor(data?: Partial<RegisterCallPayload>) {
    super(data);
  }
}
