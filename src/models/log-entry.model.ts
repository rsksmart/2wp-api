import {Model, model, property} from '@loopback/repository';

@model()
export class LogError {
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      minLength: 3,
      maxLength: 30,
      pattern: '^[a-zA-Z0-9_\\- ]+$',
    },
  })
  message: string;

  @property({
    type: 'number',
    required: true,
  })
  code: number;
}
@model()
export class LogEntry extends Model {
  @property({
    type: 'string',
    required: true,
  })
  type: 'peginNative' | 'peginFlyover' | 'pegoutNative' | 'pegoutFlyover';

  @property({
    type: 'string',
    required: true,
  })
  operation: 'success' | 'error';

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      minLength: 3,
      maxLength: 50,
      pattern: '^[a-zA-Z0-9_\\- ]+$',
    },
  })
  location: string;

  @property({
    type: 'object',
    jsonSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          minLength: 3,
          maxLength: 30,
          pattern: '^[a-zA-Z0-9_\\- ]+$',
        },
        code: {
          type: 'number',
        },
      },
      required: ['message', 'code'],
      additionalProperties: false,
    },
  })
  error?: LogError;
}