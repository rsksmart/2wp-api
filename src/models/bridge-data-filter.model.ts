export class BridgeDataFilterModel {
  abiEncodedSignature: string;

  constructor(abiEncodedSignature: string) {
    this.abiEncodedSignature = abiEncodedSignature;
  }

  isMethodCall(callData: string) {
    return callData.startsWith(this.abiEncodedSignature) ||
      callData.startsWith('0x' + this.abiEncodedSignature);
  }

  static EMPTY_DATA_FILTER() { 
    return new BridgeDataFilterModel('0x'); 
  }

}
