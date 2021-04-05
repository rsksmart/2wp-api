import {Entity, model, property} from '@loopback/repository';

@model({settings: {strict: false}})
export class PeginConfiguration extends Entity {
  @property({
    type: 'number',
    required: true,
  })
  minValue: number;

  @property({
    type: 'number',
    required: true,
  })
  maxValue: number;

  @property({
    type: 'string',
    required: true,
  })
  federationAddress: string;

  @property({
    type: 'number',
    required: true,
  })
  btcConfirmations: number;

  @property({
    type: 'string',
    required: false,
  })
  sessionId?: string;

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

  constructor(data?: Partial<PeginConfiguration>) {
    super(data);
  }
}

export interface PeginConfigurationRelations {
  // describe navigational properties here
}

export type PeginConfigurationWithRelations = PeginConfiguration &
  PeginConfigurationRelations;
