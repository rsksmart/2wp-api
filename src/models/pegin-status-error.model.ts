import {model} from '@loopback/repository';
import {BtcPeginStatus, PeginStatus, Status} from './pegin-status.model';

@model()
export class PeginStatusError extends PeginStatus {
  constructor(txId: string) {
    super(new BtcPeginStatus(txId));
    this.status = Status.ERROR_UNEXPECTED;
  }
}

export type PeginStatusErrorWithRelations = PeginStatusError;
