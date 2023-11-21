import {Model, model, property} from '@loopback/repository';

@model()
export class FeeAmount extends Model {
  @property({
    type: 'string',
    required: true,
  })
  amount: string;


  constructor(data?: Partial<FeeAmount>) {
    super(data);
  }
}

