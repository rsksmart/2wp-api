import {Entity, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class Session extends Entity {
  @property({
    type: 'string',
    id: true,
    generated: false,
    required: true,
  })
  _id: string;

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<Session>) {
    super(data);
  }
}

export type SessionWithRelations = Session;
