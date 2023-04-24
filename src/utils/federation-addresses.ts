import { BridgeService } from "../services"

const bridgeService = new BridgeService();

export const allFederationAddresses = async (): Promise<string[]> => {
  const actualFedAddress = await bridgeService.getFederationAddress();
  const oldFedAddresses = process.env.FEDERATION_ADDRESSES_HISTORY?.split(" ");
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const allAddresses: string[] = [...oldFedAddresses, actualFedAddress]
  return allAddresses;

}

export const isAFedAddress =  async (address: string): Promise<boolean> => {
  const allAddresses = await allFederationAddresses();
  return allAddresses.includes(address);
}