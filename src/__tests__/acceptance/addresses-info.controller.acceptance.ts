import {Client, expect} from '@loopback/testlab';
import sinon from 'sinon';
import {TwpapiApplication} from '../..';
import {
  ADDRESS_INFO_MAX_TXIDS,
  ADDRESS_LIST_MAX_ITEMS,
} from '../../config/limits';
import {setupApplication} from './test-helper';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {BitcoinAddress} from '../../models/bitcoin-address.model';

describe('AddressesInfoController (Acceptance)', () => {
  let app: TwpapiApplication;
  let client: Client;

  // Sample valid testnet legacy address — matches the route regex.
  const sampleAddress = 'mzMCEHDUAZaKL9BXt9SzasFPUUqM77TqP1';

  // Deterministic generator of unique valid testnet legacy addresses.
  function uniqueTestnetLegacy(index: number): string {
    const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let n = index + 1;
    let suffix = '';
    while (n > 0) {
      suffix = base58[n % 58] + suffix;
      n = Math.floor(n / 58);
    }
    return 'm' + suffix.padStart(33, 'A');
  }

  function buildAddressInfo(address: string, txids: string[]): BitcoinAddress {
    return new BitcoinAddress({
      address,
      balance: '0',
      totalReceived: '0',
      totalSent: '0',
      unconfirmedBalance: '0',
      unconfirmedTxs: '0',
      txs: txids.length,
      txids,
      page: 1,
      totalPages: 1,
      itemsOnPage: txids.length,
    });
  }

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  describe('POST /addresses-info', () => {
    it('should reject requests with more than ADDRESS_LIST_MAX_ITEMS entries (422)', async () => {
      const getAddressInfoStub = sinon.stub().resolves(buildAddressInfo(sampleAddress, []));
      app.getBinding(ServicesBindings.BITCOIN_SERVICE).to({getAddressInfo: getAddressInfoStub});

      const requestBody = {
        addressList: Array.from(
          {length: ADDRESS_LIST_MAX_ITEMS + 1},
          (_, i) => uniqueTestnetLegacy(i),
        ),
      };

      await client
        .post('/addresses-info')
        .send(requestBody)
        .expect(422);

      sinon.assert.notCalled(getAddressInfoStub);
    });

    it('should reject requests with duplicate addresses (422)', async () => {
      const getAddressInfoStub = sinon.stub().resolves(buildAddressInfo(sampleAddress, []));
      app.getBinding(ServicesBindings.BITCOIN_SERVICE).to({getAddressInfo: getAddressInfoStub});

      const requestBody = {
        addressList: [sampleAddress, sampleAddress],
      };

      await client
        .post('/addresses-info')
        .send(requestBody)
        .expect(422);

      sinon.assert.notCalled(getAddressInfoStub);
    });

    it('should cap txids per address in the serialized response', async () => {
      const bigTxids = Array.from({length: ADDRESS_INFO_MAX_TXIDS + 1}, (_, i) =>
        String(i).padStart(64, '0'),
      );
      const getAddressInfoStub = sinon.stub()
        .callsFake((address: string) => Promise.resolve(buildAddressInfo(address, bigTxids)));
      app.getBinding(ServicesBindings.BITCOIN_SERVICE).to({getAddressInfo: getAddressInfoStub});

      const requestBody = {addressList: [sampleAddress]};

      const res = await client
        .post('/addresses-info')
        .send(requestBody)
        .expect(200);

      expect(res.body).to.have.property('addressesInfo');
      expect(res.body.addressesInfo).to.be.Array();
      expect(res.body.addressesInfo).to.have.length(1);
      expect(res.body.addressesInfo[0].txids.length).to.be.lessThanOrEqual(
        ADDRESS_INFO_MAX_TXIDS,
      );
    });

    it('PoC regression: should reject 25 000 duplicate addresses without invoking the provider', async () => {
      // Return empty so the test process never tries to build the amplified
      // 5 000 000-row response while the route is still buggy.
      const getAddressInfoStub = sinon.stub().resolves(buildAddressInfo(sampleAddress, []));
      app.getBinding(ServicesBindings.BITCOIN_SERVICE).to({getAddressInfo: getAddressInfoStub});

      const requestBody = {
        addressList: Array.from({length: 25000}, () => sampleAddress),
      };

      await client
        .post('/addresses-info')
        .send(requestBody)
        .expect(422);

      sinon.assert.notCalled(getAddressInfoStub);
    }).timeout(10000);
  });
});
