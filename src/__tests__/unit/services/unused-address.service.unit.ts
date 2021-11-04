import {expect} from '@loopback/testlab';
import sinon, {SinonStubbedInstance} from 'sinon';
import {BitcoinAddress} from '../../../models/bitcoin-address.model';
import {BitcoinService, UnusedAddressService} from '../../../services';

describe('function: isUnusedAddresses', () => {

  afterEach(function () {
    sinon.restore();
  });

  const mockBitcoinService = () => {

    const mockedBitcoinService =
      sinon.createStubInstance(BitcoinService) as SinonStubbedInstance<BitcoinService> & BitcoinService;

    let addressA: BitcoinAddress = new BitcoinAddress();
    addressA.totalReceived = '0';
    addressA.totalSent = '0';
    mockedBitcoinService.getAddressInfo.withArgs('a').resolves(addressA);

    let addressB: BitcoinAddress = new BitcoinAddress();
    addressB.totalReceived = '500';
    addressB.totalSent = '400';
    mockedBitcoinService.getAddressInfo.withArgs('b').resolves(addressB);

    let addressC: BitcoinAddress = new BitcoinAddress();
    addressC.totalReceived = '0';
    addressC.totalSent = '400';
    mockedBitcoinService.getAddressInfo.withArgs('c').resolves(addressC);

    let addressD: BitcoinAddress = new BitcoinAddress();
    addressD.totalReceived = '0';
    addressD.totalSent = '0';
    mockedBitcoinService.getAddressInfo.withArgs('d').resolves(addressD);

    let addressE: BitcoinAddress = new BitcoinAddress();
    addressE.totalReceived = '500';
    addressE.totalSent = '0';
    mockedBitcoinService.getAddressInfo.withArgs('e').resolves(addressE);

    return mockedBitcoinService;
  }

  it('isUnusedAddresses empty list', async () => {
    const mockedBitcoinService
      = sinon.createStubInstance(BitcoinService) as SinonStubbedInstance<BitcoinService> & BitcoinService;

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const result = await thisService.isUnusedAddresses([]);

    expect(result).to.be.true;
    sinon.assert.neverCalledWith(mockedBitcoinService.getAddressInfo);
  })

  it('getPeginSatusInfo list unused addresses ', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const result = await thisService.isUnusedAddresses(['a', 'd']);

    expect(result).to.be.true;
    sinon.assert.calledTwice(mockedBitcoinService.getAddressInfo);
  })

  it('getPeginSatusInfo list used addresses ', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const result = await thisService.isUnusedAddresses(['b', 'c', 'e']);

    expect(result).to.be.false;
    sinon.assert.calledOnce(mockedBitcoinService.getAddressInfo);
  })

  it('getPeginSatusInfo first unused address, second used address', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const result = await thisService.isUnusedAddresses(['a', 'b', 'c']);

    expect(result).to.be.false;
    sinon.assert.calledTwice(mockedBitcoinService.getAddressInfo);
  })

  it('getPeginSatusInfo first used address, second unused address', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const result = await thisService.isUnusedAddresses(['b', 'a', 'c']);

    expect(result).to.be.false;
    sinon.assert.calledOnce(mockedBitcoinService.getAddressInfo);
  })

  it('getPeginSatusInfo just sent values', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const result = await thisService.isUnusedAddresses(['c']);

    expect(result).to.be.false;
    sinon.assert.calledOnce(mockedBitcoinService.getAddressInfo);
  })

  it('getPeginSatusInfo just received values', async () => {
    const mockedBitcoinService = mockBitcoinService();

    const thisService = new UnusedAddressService(mockedBitcoinService);
    const result = await thisService.isUnusedAddresses(['e']);

    expect(result).to.be.false;
    sinon.assert.calledOnce(mockedBitcoinService.getAddressInfo);
  })

})
