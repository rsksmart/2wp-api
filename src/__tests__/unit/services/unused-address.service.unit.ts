import {expect} from '@loopback/testlab';
import sinon, {SinonStubbedInstance} from 'sinon';
import {BitcoinAddress} from '../../../models/bitcoin-address.model';
import {BitcoinService, MockedBitcoinService, UnusedAddressService} from '../../../services';
import {AddressUsedStatus, UnusedAddressResponse} from '../../../models';

describe('Service: UnusedAddress', () => {

  afterEach(function () {
    sinon.restore();
  });

  const mockBitcoinService = () => {

    const mockedBitcoinService =
      sinon.createStubInstance(MockedBitcoinService) as SinonStubbedInstance<BitcoinService> & BitcoinService;

    const addressA: BitcoinAddress = new BitcoinAddress();
    addressA.address = 'a';
    addressA.totalReceived = '0';
    addressA.totalSent = '0';
    mockedBitcoinService.getAddressInfo.withArgs('a').resolves(addressA);

    const addressB: BitcoinAddress = new BitcoinAddress();
    addressB.address = 'b';
    addressB.totalReceived = '500';
    addressB.totalSent = '400';
    mockedBitcoinService.getAddressInfo.withArgs('b').resolves(addressB);

    const addressC: BitcoinAddress = new BitcoinAddress();
    addressC.address = 'c';
    addressC.totalReceived = '0';
    addressC.totalSent = '400';
    mockedBitcoinService.getAddressInfo.withArgs('c').resolves(addressC);

    const addressD: BitcoinAddress = new BitcoinAddress();
    addressD.address = 'd';
    addressD.totalReceived = '0';
    addressD.totalSent = '0';
    mockedBitcoinService.getAddressInfo.withArgs('d').resolves(addressD);

    const addressE: BitcoinAddress = new BitcoinAddress();
    addressE.address = 'e';
    addressE.totalReceived = '500';
    addressE.totalSent = '0';
    mockedBitcoinService.getAddressInfo.withArgs('e').resolves(addressE);

    return mockedBitcoinService;
  }
  const expectedResponses: AddressUsedStatus[] = [
    new AddressUsedStatus({
      address: 'a',
      unused: true,
    }),
    new AddressUsedStatus({
      address: 'b',
      unused: false,
    }),
    new AddressUsedStatus({
      address: 'c',
      unused: false,
    }),
    new AddressUsedStatus({
      address: 'd',
      unused: true,
    }),
    new AddressUsedStatus({
      address: 'e',
      unused: false,
    }),
  ];

  it('isUnusedAddresses empty list', async () => {
    const mockedBitcoinService
      = sinon.createStubInstance(MockedBitcoinService) as SinonStubbedInstance<BitcoinService> & BitcoinService;
    const thisService = new UnusedAddressService(mockedBitcoinService);
    const result = await thisService.isUnusedAddresses([]);
    expect(result).to.be.eql(new UnusedAddressResponse({ data : []}));
    sinon.assert.neverCalledWith(mockedBitcoinService.getAddressInfo);
  });
  it('getPeginSatusInfo list unused addresses ', async () => {
    const mockedBitcoinService = mockBitcoinService();
    const thisService = new UnusedAddressService(mockedBitcoinService);
    const request = ['a', 'd'];
    const result = await thisService.isUnusedAddresses(request);
    expect(result).to.be.eql(new UnusedAddressResponse({
      data: expectedResponses
        .filter((res) => request.indexOf(res.address) !== -1)
    }));
    sinon.assert.calledTwice(mockedBitcoinService.getAddressInfo);
  });
  it('getPeginSatusInfo list used addresses ', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const request = ['b', 'c', 'e'];
    const result = await thisService.isUnusedAddresses(request);
    expect(result).to.be.eql(new UnusedAddressResponse({
      data: expectedResponses
        .filter((res) => request.indexOf(res.address) !== -1)
    }));
    sinon.assert.callCount(mockedBitcoinService.getAddressInfo, 3);
  });
  it('getPeginSatusInfo first unused address, second used address', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const request = ['a', 'b', 'c'];
    const result = await thisService.isUnusedAddresses(request);
    expect(result).to.be.eql(new UnusedAddressResponse({
      data: expectedResponses
        .filter((res) => request.indexOf(res.address) !== -1)
    }));
    sinon.assert.callCount(mockedBitcoinService.getAddressInfo, 3);
  });
  it('getPeginSatusInfo just sent values', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const request = ['c'];
    const result = await thisService.isUnusedAddresses(request);
    expect(result).to.be.eql(new UnusedAddressResponse({
      data: expectedResponses
        .filter((res) => request.indexOf(res.address) !== -1)
    }));
    sinon.assert.calledOnce(mockedBitcoinService.getAddressInfo);
  });
  it('getPeginSatusInfo just received values', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const request = ['e'];
    const result = await thisService.isUnusedAddresses(request);
    expect(result).to.be.eql(new UnusedAddressResponse({
      data: expectedResponses
        .filter((res) => request.indexOf(res.address) !== -1)
    }));
    sinon.assert.calledOnce(mockedBitcoinService.getAddressInfo);
  });
})
