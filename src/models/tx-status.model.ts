/* eslint-disable @typescript-eslint/naming-convention */
import {Model, model, property} from '@loopback/repository';
import {PeginStatus} from './pegin-status.model';
import {PegoutStatusDataModel} from './rsk/pegout-status-data-model';

@model()
export class TxStatus extends Model {
  @property({
    type: 'object',
  })
    txDetails?: PeginStatus | PegoutStatusDataModel;

  @property({
    type: 'string',
    required: true,
  })
    type: TxStatusType;

  constructor(data?: Partial<TxStatus>) {
    super(data);
  }
}

// eslint-disable-next-line no-shadow
export enum TxStatusType {
  PEGIN = 'PEGIN',
  PEGOUT = 'PEGOUT',
  INVALID_DATA = 'INVALID_DATA',
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
}
