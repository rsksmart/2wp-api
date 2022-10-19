import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class BroadcastResponse extends Model {
  @property({
    type: 'string',
  })
    txId?: string;

  @property({
    type: 'object',
  })
    error?: object;

  constructor(data?: Partial<BroadcastResponse>) {
    super(data);
  }
}

export type BroadcastResponseWithRelations = BroadcastResponse;
