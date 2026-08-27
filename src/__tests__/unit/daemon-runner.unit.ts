import {expect} from '@loopback/testlab';
import {DaemonRunner} from '../../daemon-runner';

describe('DaemonRunner', () => {
  const originalNetwork = process.env.NETWORK;

  afterEach(() => {
    if (originalNetwork === undefined) {
      delete process.env.NETWORK;
    } else {
      process.env.NETWORK = originalNetwork;
    }
  });

  it('refuses to start when NETWORK is not configured', () => {
    delete process.env.NETWORK;
    expect(() => new DaemonRunner()).to.throw(/NETWORK/);
  });

  it('refuses to start when NETWORK holds an unsupported value', () => {
    process.env.NETWORK = 'regtest';
    expect(() => new DaemonRunner()).to.throw(/NETWORK/);
  });

  it('builds when NETWORK is configured', () => {
    process.env.NETWORK = 'testnet';
    expect(() => new DaemonRunner()).to.not.throw();
  });
});
