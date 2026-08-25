import {expect} from '@loopback/testlab';
import {HttpErrors} from '@loopback/rest';
import sinon from 'sinon';
import {AddressService, TxV2Service} from '../../../services';
import {LastBlockService} from '../../../services/btc-last-block.service';
import {BitcoinService} from '../../../services/pegin-status/bitcoin.service';

const givenService = (addressProvider: sinon.SinonStub) =>
  new BitcoinService(
    {} as TxV2Service,
    {addressProvider} as unknown as AddressService,
    {} as LastBlockService,
  );

const givenTxService = (txV2Provider: sinon.SinonStub) =>
  new BitcoinService(
    {txV2Provider} as unknown as TxV2Service,
    {} as AddressService,
    {} as LastBlockService,
  );

const givenLastBlockService = (lastBlockProvider: sinon.SinonStub) =>
  new BitcoinService(
    {} as TxV2Service,
    {} as AddressService,
    {lastBlockProvider} as unknown as LastBlockService,
  );

const caughtFrom = async (work: () => Promise<unknown>) => {
  try {
    await work();
  } catch (err) {
    return err as any;
  }
  throw new Error('expected the call to fail');
};

describe('Service: BitcoinService error propagation', () => {
  it('preserves an upstream gateway-timeout instead of collapsing it', async () => {
    const service = givenService(
      sinon.stub().rejects(new HttpErrors.GatewayTimeout('upstream timed out')),
    );

    let caught: any = null;
    try {
      await service.getAddressInfo('mzMCEHDUAZaKL9BXt9SzasFPUUqM77TqP1');
    } catch (err) {
      caught = err;
    }

    // Rejecting with a bare string would erase the status and surface as a 500,
    // which also destroys any cancellation travelling this path.
    expect(caught).to.be.instanceOf(Error);
    expect(caught.statusCode).to.equal(504);
  });

  it('preserves an upstream bad-gateway', async () => {
    const service = givenService(
      sinon.stub().rejects(new HttpErrors.BadGateway('upstream failed')),
    );

    let caught: any = null;
    try {
      await service.getAddressInfo('mzMCEHDUAZaKL9BXt9SzasFPUUqM77TqP1');
    } catch (err) {
      caught = err;
    }

    expect(caught.statusCode).to.equal(502);
  });

  it('still resolves a successful lookup', async () => {
    const service = givenService(
      sinon.stub().resolves([
        {address: 'abc', balance: '1', txs: 0, txids: []},
      ]),
    );

    const info = await service.getAddressInfo('abc');
    expect(info.address).to.equal('abc');
  });

  describe('the other two provider calls', () => {
    // Same defect as getAddressInfo had: rejecting with a bare string erases the
    // status, so a 502/504 arrives as a 500 and any cancellation travelling the
    // path is destroyed along with it.
    it('preserves an upstream status from getTx', async () => {
      const service = givenTxService(
        sinon.stub().rejects(new HttpErrors.GatewayTimeout('upstream timed out')),
      );

      const caught = await caughtFrom(() => service.getTx('a'.repeat(64)));

      expect(caught).to.be.instanceOf(Error);
      expect(caught.statusCode).to.equal(504);
    });

    it('preserves an upstream status from getLastBlock', async () => {
      const service = givenLastBlockService(
        sinon.stub().rejects(new HttpErrors.BadGateway('upstream failed')),
      );

      const caught = await caughtFrom(() => service.getLastBlock());

      expect(caught).to.be.instanceOf(Error);
      expect(caught.statusCode).to.equal(502);
    });

    it('rejects getTx with an Error even for a plain failure', async () => {
      const service = givenTxService(sinon.stub().rejects(new Error('boom')));

      const caught = await caughtFrom(() => service.getTx('a'.repeat(64)));

      expect(caught).to.be.instanceOf(Error);
    });

    it('rejects getLastBlock with an Error even for a plain failure', async () => {
      const service = givenLastBlockService(
        sinon.stub().rejects(new Error('boom')),
      );

      const caught = await caughtFrom(() => service.getLastBlock());

      expect(caught).to.be.instanceOf(Error);
    });

    it('carries the provider error through for the logs', async () => {
      // Rethrowing unchanged is the point, and it is what getAddressInfo already
      // does. Keeping the provider's message out of the *client* response is the
      // bounded error writer's job, which replaces messages by status class and
      // is tested there — not this service's.
      const service = givenTxService(
        sinon.stub().rejects(new Error('provider detail for the log')),
      );

      const caught = await caughtFrom(() => service.getTx('a'.repeat(64)));

      expect(String(caught.message)).to.match(/provider detail for the log/);
    });
  });
});
