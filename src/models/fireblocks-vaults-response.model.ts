import {Model, model, property} from '@loopback/repository';

@model()
export class FireblocksVaultsResponse extends Model {
  @property({
    type: 'object',
    required: true,
  })
  vaults: object;

  @property({
    type: 'string',
    required: false,
  })
  error?: string;

  constructor(data?: Partial<FireblocksVaultsResponse>) {
    super(data);
  }
}

export type FireblocksVaultsResponseWithRelations = FireblocksVaultsResponse; 