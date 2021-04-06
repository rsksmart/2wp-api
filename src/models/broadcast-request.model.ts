import {Model, model, property} from '@loopback/repository';

@model()
export class BroadcastRequest extends Model {
  @property({
    type: 'string',
    required: true,
  })
  data: string;

  constructor(data?: Partial<BroadcastRequest>) {
    super(data);
  }
}

export type BroadcastRequestWithRelations = BroadcastRequest;
