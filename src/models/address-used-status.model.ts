import {Model, model, property} from '@loopback/repository';

@model()
export class AddressUsedStatus extends Model {
  @property({
    type: 'string',
    required: true,
  })
  address: string;

  @property({
    type: 'boolean',
    required: true,
  })
  unused: boolean;


  constructor(data?: Partial<AddressUsedStatus>) {
    super(data);
  }
}

export interface AddressUsedStatusRelations {
  // describe navigational properties here
}

export type AddressUsedStatusWithRelations = AddressUsedStatus & AddressUsedStatusRelations;
