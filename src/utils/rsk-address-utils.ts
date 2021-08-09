import {ensure0x} from './hex-utils';

export class RskAddressUtils {
  constructor() {}

  public getRskAddressFromOpReturn(data: string): string {
    return ensure0x(Buffer.from(`${data}`, 'hex').toString('hex'));
  }
}
