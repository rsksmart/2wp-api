/* eslint-disable no-unused-vars */
declare module '@rsksmart/rsk-precompiled-abis';
declare module 'pegin-address-verifier' {
  function isValidAddress(address: string, networkType: string): boolean;
  function getAddressInformation(address: string): AddressInformation;
  function canPegIn(addressInfo: AddressInformation): boolean;
  export interface AddressInformation {
    network: string;
    type: string;
    scriptPubKey: string;
    scriptHash: string;
  }
}
