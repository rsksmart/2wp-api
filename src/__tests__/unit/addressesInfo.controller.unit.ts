import {AddressesInfoController} from '../../controllers';
import {expect} from '@loopback/testlab';
import {BitcoinService} from '../../services';
import sinon, {SinonStubbedInstance} from 'sinon';
import {
  ADDRESS_INFO_MAX_TXIDS,
  ADDRESS_LIST_MAX_ITEMS,
  PROVIDER_CONCURRENCY,
} from '../../config/limits';
import {AddressList} from '../../models';
import {BitcoinAddress} from '../../models/bitcoin-address.model';

describe('Addresses Info Controller:', () => {
  let addressInfoController: AddressesInfoController;
  let bitcoinService: SinonStubbedInstance<BitcoinService> & BitcoinService;

it('returns the address info from a provided address list', async () => {

  const addressList = [
    'mzMCEHDUAZaKL9BXt9SzasFPUUqM77TqP1',
    'mqCjBpQ75Y5sSGzFtJtSQQZqhJze9eaKjV',
    '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
    '2NCZ2CNYiz4rrHq3miUHerUMcLyeWU4gw9C',
    'tb1qtanvhhl8ve32tcdxkrsamyy6vq5p62ctdv89l0',
    'tb1qfuk3j0l4qn4uzstc47uwk68kedmjwuucl7avqr',
  ];
  const addressesInfo: BitcoinAddress[] = addressList.map((address) =>
    new BitcoinAddress({
      address,
      balance: '3000',
      totalReceived: '5000',
      totalSent: '2000',
      unconfirmedBalance: '3000',
      unconfirmedTxs: 'testTxID',
      txs: 4,
      txids: [],
      page: 0,
      totalPages: 1,
      itemsOnPage: 1,
    })
  );

  bitcoinService = sinon.createStubInstance(BitcoinService) as SinonStubbedInstance<BitcoinService> & BitcoinService;
  addressList.forEach((address, index) => bitcoinService.getAddressInfo.withArgs(address).resolves(addressesInfo[index]));
  addressInfoController = new AddressesInfoController(bitcoinService);

  const response = await addressInfoController.getAddressesInfo(new AddressList({ addressList }));
  expect(response.addressesInfo).to.deepEqual(addressesInfo);
  sinon.assert.callCount(bitcoinService.getAddressInfo, addressList.length);
});


describe('Duplicate address-list response amplification', () => {
  const sampleAddress = 'mzMCEHDUAZaKL9BXt9SzasFPUUqM77TqP1';

  // Deterministic generator of unique valid testnet legacy addresses.
  // Matches [13mn][a-km-zA-HJ-NP-Z1-9]{25,34} via 'm' + 33 base58 chars.
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

  function freshController(): {
    controller: AddressesInfoController;
    service: SinonStubbedInstance<BitcoinService> & BitcoinService;
  } {
    const service = sinon.createStubInstance(BitcoinService) as SinonStubbedInstance<BitcoinService> & BitcoinService;
    const controller = new AddressesInfoController(service);
    return {controller, service};
  }

  it('should reject addressList exceeding ADDRESS_LIST_MAX_ITEMS without calling the provider', async () => {
    const {controller, service} = freshController();
    service.getAddressInfo.resolves(buildAddressInfo(sampleAddress, []));

    const addressList = new AddressList({
      addressList: Array.from(
        {length: ADDRESS_LIST_MAX_ITEMS + 1},
        (_, i) => uniqueTestnetLegacy(i),
      ),
    });

    let caught: unknown = null;
    try {
      await controller.getAddressesInfo(addressList);
    } catch (err) {
      caught = err;
    }

    expect(caught).to.not.be.null();
    sinon.assert.notCalled(service.getAddressInfo);
  });

  it('should reject addressList containing duplicate addresses', async () => {
    const {controller, service} = freshController();
    service.getAddressInfo.resolves(buildAddressInfo(sampleAddress, []));

    const addressList = new AddressList({
      addressList: [sampleAddress, sampleAddress],
    });

    let caught: unknown = null;
    try {
      await controller.getAddressesInfo(addressList);
    } catch (err) {
      caught = err;
    }

    expect(caught).to.not.be.null();
    sinon.assert.notCalled(service.getAddressInfo);
  });

  it('should call the provider at most once per unique address (defense in depth)', async () => {
    const {controller, service} = freshController();
    service.getAddressInfo.resolves(buildAddressInfo(sampleAddress, []));

    const addressList = new AddressList({
      addressList: [sampleAddress, sampleAddress, sampleAddress],
    });

    try {
      await controller.getAddressesInfo(addressList);
    } catch {
      // Rejection is also acceptable — the assertion below covers it.
    }

    expect(service.getAddressInfo.callCount).to.be.lessThanOrEqual(1);
  });

  it('should bound provider fan-out concurrency to PROVIDER_CONCURRENCY', async () => {
    const {controller, service} = freshController();

    let inFlight = 0;
    let maxInFlight = 0;
    service.getAddressInfo.callsFake(async (address: string) => {
      inFlight += 1;
      if (inFlight > maxInFlight) maxInFlight = inFlight;
      await new Promise(resolve => setTimeout(resolve, 25));
      inFlight -= 1;
      return buildAddressInfo(address, []);
    });

    const addresses = Array.from(
      {length: PROVIDER_CONCURRENCY * 4},
      (_, i) => uniqueTestnetLegacy(i),
    );
    const addressList = new AddressList({addressList: addresses});

    await controller.getAddressesInfo(addressList);

    expect(maxInFlight).to.be.lessThanOrEqual(PROVIDER_CONCURRENCY);
  });

  it('should cap txids per address to ADDRESS_INFO_MAX_TXIDS in the response', async () => {
    const {controller, service} = freshController();

    const bigTxids = Array.from({length: ADDRESS_INFO_MAX_TXIDS + 1}, (_, i) =>
      String(i).padStart(64, '0'),
    );
    service.getAddressInfo.resolves(buildAddressInfo(sampleAddress, bigTxids));

    const addressList = new AddressList({addressList: [sampleAddress]});

    const response = await controller.getAddressesInfo(addressList);

    expect(response.addressesInfo).to.not.be.undefined();
    expect(response.addressesInfo!).to.have.length(1);
    expect(response.addressesInfo![0].txids.length).to.be.lessThanOrEqual(
      ADDRESS_INFO_MAX_TXIDS,
    );
  });

  it('PoC regression: should reject 25 000 duplicate addresses without invoking the provider', async () => {
    const {controller, service} = freshController();
    service.getAddressInfo.resolves(buildAddressInfo(sampleAddress, []));

    const addressList = new AddressList({
      addressList: Array.from({length: 25000}, () => sampleAddress),
    });

    const startedAt = Date.now();
    let caught: unknown = null;
    try {
      await controller.getAddressesInfo(addressList);
    } catch (err) {
      caught = err;
    }
    const elapsedMs = Date.now() - startedAt;

    expect(caught).to.not.be.null();
    sinon.assert.notCalled(service.getAddressInfo);
    expect(elapsedMs).to.be.lessThan(500);
  });
});
});
