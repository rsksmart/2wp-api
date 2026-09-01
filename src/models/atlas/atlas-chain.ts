import * as constants from '../../constants';

/**
 * Qualified chain identifiers used by the Atlas SWAP event schema.
 * The network suffix is always explicit so the analytics side never has to
 * guess which chain a swap belongs to.
 */
export const CHAIN_IDS = {
  ROOTSTOCK_MAINNET: 'rootstock_mainnet',
  ROOTSTOCK_TESTNET: 'rootstock_testnet',
  BITCOIN_MAINNET: 'bitcoin_mainnet',
  BITCOIN_TESTNET: 'bitcoin_testnet',
} as const;

export type ChainId = (typeof CHAIN_IDS)[keyof typeof CHAIN_IDS];

export interface SwapChainIds {
  sourceChain: ChainId;
  destinationChain: ChainId;
}

const SUPPORTED_NETWORKS: string[] = [constants.NETWORK_MAINNET, constants.NETWORK_TESTNET];

/**
 * Returns the configured `NETWORK`, failing fast when it is missing or not one
 * of `mainnet` / `testnet`.
 *
 * Unlike the rest of the repository this resolver deliberately does **not**
 * default to testnet: a mainnet deployment missing the variable would label
 * every event as testnet and silently contaminate the analytics database.
 *
 * @throws Error when `NETWORK` is absent or holds an unsupported value.
 */
export function assertNetworkConfigured(): string {
  const network = process.env.NETWORK;
  if (!network || !SUPPORTED_NETWORKS.includes(network)) {
    throw new Error(
      `Atlas events require NETWORK to be exactly '${constants.NETWORK_MAINNET}' or ` +
      `'${constants.NETWORK_TESTNET}'. Got '${network ?? ''}'.`,
    );
  }
  return network;
}

/**
 * Resolves the chain ids of a native peg-out: Rootstock is always the source
 * chain and Bitcoin always the destination chain.
 *
 * @returns The qualified `sourceChain` / `destinationChain` pair for the configured network.
 * @throws Error when `NETWORK` is not configured. See {@link assertNetworkConfigured}.
 */
export function resolvePegoutChainIds(): SwapChainIds {
  const network = assertNetworkConfigured();
  if (network === constants.NETWORK_MAINNET) {
    return {
      sourceChain: CHAIN_IDS.ROOTSTOCK_MAINNET,
      destinationChain: CHAIN_IDS.BITCOIN_MAINNET,
    };
  }
  return {
    sourceChain: CHAIN_IDS.ROOTSTOCK_TESTNET,
    destinationChain: CHAIN_IDS.BITCOIN_TESTNET,
  };
}

/**
 * Resolves the chain ids of a native peg-in, the mirror image of a peg-out:
 * Bitcoin is always the source chain and Rootstock always the destination.
 *
 * @returns The qualified `sourceChain` / `destinationChain` pair for the configured network.
 * @throws Error when `NETWORK` is not configured. See {@link assertNetworkConfigured}.
 */
export function resolvePeginChainIds(): SwapChainIds {
  const {sourceChain, destinationChain} = resolvePegoutChainIds();
  return {sourceChain: destinationChain, destinationChain: sourceChain};
}
