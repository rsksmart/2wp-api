import {Model, model, property} from '@loopback/repository';
import {PeginStatus} from "./pegin-status.model";
import { PegoutStatus } from './pegout-status.model';

@model()
export class TxStatus extends Model {
  @property({
    type: 'object',
  })
  txDetails?: PeginStatus | PegoutStatus;

  @property({
    type: 'string',
    required: true,
  })
  type: TxStatusType;


  constructor(data?: Partial<TxStatus>) {
    super(data);
  }
}

export enum TxStatusType {
  PEGIN = 'PEGIN',
  PEGOUT = 'PEGOUT',
  FLYOVER_PEGIN = 'FLYOVER_PEGIN',
  FLYOVER_PEGOUT = 'FLYOVER_PEGOUT',
  INVALID_DATA = 'INVALID_DATA',
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
}
