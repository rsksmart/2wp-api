export class BridgeDataFilterModel {
  abiEncodedSignature: string;
  static EMPTY_DATA_FILTER = new BridgeDataFilterModel('0x');

  constructor(abiEncodedSignature: string) {
    this.abiEncodedSignature = abiEncodedSignature;
  }

  isMethodCall(callData: string) {
    const methodSignature = callData.slice(0, 10);
    return methodSignature === this.abiEncodedSignature;
  }

}
