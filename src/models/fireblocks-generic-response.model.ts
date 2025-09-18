import {Model, model, property} from '@loopback/repository';

@model()
export class FireblocksGenericResponse extends Model {
  @property({
    type: 'object',
    required: false,
  })
  data?: object;

  @property({
    type: 'number',
    required: false,
  })
  statusCode?: number;

  @property({
    type: 'string',
    required: false,
  })
  error?: string;

  constructor(data?: Partial<FireblocksGenericResponse>) {
    super(data);
  }
}

export type FireblocksGenericResponseWithRelations = FireblocksGenericResponse;
