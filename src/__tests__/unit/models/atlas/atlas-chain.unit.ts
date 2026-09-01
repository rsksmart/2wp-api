import {expect} from '@loopback/testlab';
import {
  CHAIN_IDS,
  assertNetworkConfigured,
  resolvePegoutChainIds,
  resolvePeginChainIds,
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
    expect(resolvePegoutChainIds()).to.eql({
      sourceChain: CHAIN_IDS.ROOTSTOCK_MAINNET,
      destinationChain: CHAIN_IDS.BITCOIN_MAINNET,
    });
  });

  it('resolves testnet chain ids', () => {
    process.env.NETWORK = 'testnet';
    expect(resolvePegoutChainIds()).to.eql({
      sourceChain: CHAIN_IDS.ROOTSTOCK_TESTNET,
      destinationChain: CHAIN_IDS.BITCOIN_TESTNET,
    });
  });

  it('throws when NETWORK is absent instead of defaulting to testnet', () => {
    delete process.env.NETWORK;
    expect(() => resolvePegoutChainIds()).to.throw(/NETWORK/);
    expect(() => assertNetworkConfigured()).to.throw(/NETWORK/);
  });

  it('throws when NETWORK holds an unsupported value', () => {
    process.env.NETWORK = 'regtest';
    expect(() => resolvePegoutChainIds()).to.throw(/NETWORK/);
  });

  it('throws when NETWORK is an empty string', () => {
    process.env.NETWORK = '';
    expect(() => resolvePegoutChainIds()).to.throw(/NETWORK/);
  });

  it('always sources from Rootstock and targets Bitcoin', () => {
    for (const network of ['mainnet', 'testnet']) {
      process.env.NETWORK = network;
      const {sourceChain, destinationChain} = resolvePegoutChainIds();
      expect(sourceChain.startsWith('rootstock_')).to.be.true();
      expect(destinationChain.startsWith('bitcoin_')).to.be.true();
    }
  });

  it('returns the configured network from assertNetworkConfigured', () => {
    process.env.NETWORK = 'mainnet';
    expect(assertNetworkConfigured()).to.equal('mainnet');
  });

  describe('peg-in', () => {
    it('resolves mainnet chain ids', () => {
      process.env.NETWORK = 'mainnet';
      expect(resolvePeginChainIds()).to.eql({
        sourceChain: 'bitcoin_mainnet',
        destinationChain: 'rootstock_mainnet',
      });
    });

    it('resolves testnet chain ids', () => {
      process.env.NETWORK = 'testnet';
      expect(resolvePeginChainIds()).to.eql({
        sourceChain: 'bitcoin_testnet',
        destinationChain: 'rootstock_testnet',
      });
    });

    it('is the mirror image of a peg-out', () => {
      process.env.NETWORK = 'testnet';
      const pegout = resolvePegoutChainIds();
      const pegin = resolvePeginChainIds();

      expect(pegin.sourceChain).to.equal(pegout.destinationChain);
      expect(pegin.destinationChain).to.equal(pegout.sourceChain);
    });

    it('throws when NETWORK is absent instead of defaulting to testnet', () => {
      delete process.env.NETWORK;
      expect(() => resolvePeginChainIds()).to.throw(/NETWORK/);
    });
  });

});
