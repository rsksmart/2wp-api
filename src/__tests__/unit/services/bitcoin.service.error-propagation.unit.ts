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
});
