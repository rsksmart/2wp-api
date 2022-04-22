export class BridgeDataFilterModel {
  abiEncodedSignature: string;
  static EMPTY_DATA_FILTER = new BridgeDataFilterModel('0x');

  constructor(abiEncodedSignature: string) {
    this.abiEncodedSignature = abiEncodedSignature;
  }

  isMethodCall(callData: string) {
    return callData.startsWith(this.abiEncodedSignature) ||
      callData.startsWith('0x' + this.abiEncodedSignature);
  }

}
