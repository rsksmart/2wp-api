import {expect} from '@loopback/testlab';
import {
  CHAIN_IDS,
  assertNetworkConfigured,
  resolveChainIds,
} from '../../../../models/atlas/atlas-chain';

describe('Model: atlas-chain', () => {
  const originalNetwork = process.env.NETWORK;

  afterEach(() => {
    if (originalNetwork === undefined) {
      delete process.env.NETWORK;
    } else {
      process.env.NETWORK = originalNetwork;
    }
  });

  it('resolves mainnet chain ids', () => {
    process.env.NETWORK = 'mainnet';
    expect(resolveChainIds()).to.eql({
      sourceChain: CHAIN_IDS.ROOTSTOCK_MAINNET,
      destinationChain: CHAIN_IDS.BITCOIN_MAINNET,
    });
  });

  it('resolves testnet chain ids', () => {
    process.env.NETWORK = 'testnet';
    expect(resolveChainIds()).to.eql({
      sourceChain: CHAIN_IDS.ROOTSTOCK_TESTNET,
      destinationChain: CHAIN_IDS.BITCOIN_TESTNET,
    });
  });

  it('throws when NETWORK is absent instead of defaulting to testnet', () => {
    delete process.env.NETWORK;
    expect(() => resolveChainIds()).to.throw(/NETWORK/);
    expect(() => assertNetworkConfigured()).to.throw(/NETWORK/);
  });

  it('throws when NETWORK holds an unsupported value', () => {
    process.env.NETWORK = 'regtest';
    expect(() => resolveChainIds()).to.throw(/NETWORK/);
  });

  it('throws when NETWORK is an empty string', () => {
    process.env.NETWORK = '';
    expect(() => resolveChainIds()).to.throw(/NETWORK/);
  });

  it('always sources from Rootstock and targets Bitcoin', () => {
    for (const network of ['mainnet', 'testnet']) {
      process.env.NETWORK = network;
      const {sourceChain, destinationChain} = resolveChainIds();
      expect(sourceChain.startsWith('rootstock_')).to.be.true();
      expect(destinationChain.startsWith('bitcoin_')).to.be.true();
    }
  });

  it('returns the configured network from assertNetworkConfigured', () => {
    process.env.NETWORK = 'mainnet';
    expect(assertNetworkConfigured()).to.equal('mainnet');
  });
});
