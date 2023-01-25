import {Model, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class LastBlockInfo extends Model {

  @property({
    type: 'number',
  })
  page: number;
 
  @property({
    type: 'string',
  })
  coin: string;

  @property({
    type: 'string',
  })
  host: string;

  @property({
    type: 'string',
  })
  version: string;

  @property({
    type: 'boolean',
  })
  syncMode: boolean;

  @property({
    type: 'boolean',
  })
  inSync: boolean;

  @property({
    type: 'number',
  })
  bestHeight: number;

  @property({
    type: 'string',
  })
  chain: string;

  @property({
    type: 'number',
  })
  blocks: number;

  @property({
    type: 'string',
  })
  bestBlockHash: string;


  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor() {
    super();
  }
}
