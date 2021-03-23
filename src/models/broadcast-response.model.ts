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

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<BroadcastResponse>) {
    super(data);
  }
}

export interface BroadcastResponseRelations {
  // describe navigational properties here
}

export type BroadcastResponseWithRelations = BroadcastResponse &
  BroadcastResponseRelations;
