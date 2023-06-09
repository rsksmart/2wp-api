import { Model, model, property } from '@loopback/repository';
import { Utxo } from './utxo.model';

@model()
export class UtxoResponse extends Model {
  @property({
    type: 'array',
    itemType: 'object',
    required: true,
  })
  data: Utxo[];


  constructor(data?: Partial<UtxoResponse>) {
    super(data);
  }
}

