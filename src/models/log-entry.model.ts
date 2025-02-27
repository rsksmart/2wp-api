import {Model, model, property} from '@loopback/repository';

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
  })
  location: string;

  @property({
    type: 'object',
  })
  error?: Error;
}