import {AddressesInfoController} from '../../controllers/AddressesInfo.controller';
import {expect} from '@loopback/testlab';
import {BitcoinService} from '../../services';
import sinon, {SinonStubbedInstance} from 'sinon';
import {AddressList} from '../../models';
import {BitcoinAddress} from '../../models/bitcoin-address.model';

describe('Addresses Info Controller:', () => {
  let addressInfoController: AddressesInfoController;
  let bitcoinService: SinonStubbedInstance<BitcoinService> & BitcoinService;

it('returns the address info from a provided address list', () => {

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

  addressInfoController.getAddressesInfo(new AddressList({ addressList }))
    .then((response) => {
      expect(response).to.be.equal(addressesInfo);
    });
});
});
