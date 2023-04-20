import { BridgeService } from "../services"
import { config } from "dotenv";

const bridgeService = new BridgeService();

export const allFederationAddresses = async (): Promise<string[]> => {
  const actualFedAddress = await bridgeService.getFederationAddress();
  //const oldFedAddresses = process.env.FEDERATION_ADDRESSES_HISTORY?.split(",");
  const oldFedAddresses = ['2N1rW3cBZNzs2ZxSfyNW7cMcNBktt6fzs88', '2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB']
  const allAddresses: string[] = [...oldFedAddresses, actualFedAddress]
  return allAddresses;

}

export const isAFedAddress =  async (address: string): Promise<boolean> => {
  const allAddresses = await allFederationAddresses();
  return allAddresses.includes(address);
}