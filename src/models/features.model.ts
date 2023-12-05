import {Entity, model, property} from '@loopback/repository';


export class Features extends Entity {

  @property({
    type: 'date',
    defaultFn: 'now'
  })
  creationDate: Date;

  @property({
    type: 'date',
    defaultFn: 'now'
  })
  lastUpdateDate: Date;

  @property({
    type: 'string',
  })
  name: string;

  @property({
    type: 'string',
  })
  value: string;

  @property({
    type: 'number',
  })
  version: number;

  @property({
    type: 'number',
    id: true,
    generated: true,
  })
  id?: number;

  // Define well-known properties here

  // Indexer property to allow additional data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [prop: string]: any;

  constructor(data?: Partial<Features>) {
    super(data);
  }
  getIdFieldName(): string {
    return 'id';
  }
  getId() {
    return this.id;
  }
  
}