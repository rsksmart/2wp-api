
export class RskAddressUtils {

  constructor() {
  }

  public getRskAddressFromOpReturn(data: string): string {
    return Buffer.from(`${data}`, 'hex').toString('hex');
  }

}
