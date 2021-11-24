import {expect} from '@loopback/testlab';
import {BtcAddressUtils, calculateBtcTxHash} from '../../../utils/btc-utils';
import {
  getLegacyAddressList,
  getNativeSegwitAddressList,
  getSewitAddressList,
} from '../../helper';
import * as constants from '../../../constants';

describe('function: getPeginSatusInfo', () => {
  const btcAddressUtils = new BtcAddressUtils();

  it('getRefundAddress P2SH valid', async () => {
    const utility = new BtcAddressUtils();
    const result = utility.getRefundAddress('02379ad9b7ba73bdc1e29e286e014d4e2e1f6884e3');
    expect(result).to.be.equal('2MxKEf2su6FGAUfCEAHreGFQvEYrfYNHvL7');
  });

  it('getRefundAddress P2PKH valid', async () => {
    const utility = new BtcAddressUtils();
    const result = utility.getRefundAddress('01ccc198c15d8344c73da67a75509a85a8f4226636');
    expect(result).to.be.equal('mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef');
  });

  it('getRefundAddress P2SH invalid', async () => {
    const utility = new BtcAddressUtils();
    const result = utility.getRefundAddress('02ccc198c15d8344509a85a8f4226636');
    expect(result).to.be.empty();
  });

  it('getRefundAddress P2PKH invalid', async () => {

    const utility = new BtcAddressUtils();
    const result = utility.getRefundAddress('01379ad9b7ba73bdc1d4e2e1f6884e3');
    expect(result).to.be.empty();
  });

  it('getRefundAddress type invalid', async () => {
    const utility = new BtcAddressUtils();
    const result = utility.getRefundAddress('05379ad9b7ba73bdc1e29e286e014d4e2e1f6884e3');
    expect(result).to.be.empty();
  });

  it('calculateBtcTxHash calculate tx hash with segwit ', async () => {
    const result = calculateBtcTxHash('010000000001011093c9e54f1d5888b4bf7118b179e16f4d290ec3d000cb80192ab28a5c32c6c602000000171600145aaaca106deb80277dd1a68ee979af5845c5076dffffffff030000000000000000306a2e52534b5401224d0b72bab9342f898c633ef187abff8a96c0fa014a74c48b9e3a5644adb734ab536cab6ae28e85ce98a107000000000017a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b987315977020000000017a914c4f85a2e369fac8b49eae4a5e80de233f7ec4ed687024730440221008c1311c334b53d39f3a5e4453ed89d8e407b023865e4ee535e5ea94e46d76bf9021f3a416c8bdb705fa5237b6bbc1d000fc9e9da71bd698b97eaeed042c69b32420121026764af4b1405e706f15a687a44e7adde0c7049884f2054b10a169dbc9d1d68e300000000');
    expect(result).to.be.equal('cfca48c97bb00c524837149b71df3ad908ba44ee61244efc8fe2b13953d58105');
  });

  it('calculateBtcTxHash calculate tx hash without segwit ', async () => {
    const result = calculateBtcTxHash('0100000001c5c559fb5b35d31a8ae075c0b756e41a55281bb84658aaaf7f736f6f812f01e3020000006b483045022100f9de3d30ac040ee1d1541d54d335afd70862bfc8e701297e28fbcd4e3925b342022063562b1ae303069ad471cffeb7b488752e3ab564191a715a14a2f5623705c8f1012102968f0a643d7857c2a70c4a6f5b2d4ebcfdaecbb1fb7b9ac36cf41eee40b1379fffffffff030000000000000000306a2e52534b5401224d0b72bab9342f898c633ef187abff8a96c0fa014a74c48b9e3a5644adb734ab536cab6ae28e85ce84a107000000000017a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b98739a01800000000001976a914c7432845bef39a02855fdda2e20e00586765060988ac00000000');
    expect(result).to.be.equal('1722f68a17b151894cb62b7b2971e62e16412feb57ca714d231d686d1a661f96');
  });

  it('Validate the account type given an address', () => {
    getLegacyAddressList().forEach((walletAddress) => {
      const {addressType} = btcAddressUtils.validateAddress(walletAddress.address);
      expect(addressType).to.eql(
        constants.BITCOIN_LEGACY_ADDRESS,
      );
    });
    getNativeSegwitAddressList().forEach((walletAddress) => {
      const {addressType} = btcAddressUtils.validateAddress(walletAddress.address);
      expect(addressType).to.eql(
        constants.BITCOIN_NATIVE_SEGWIT_ADDRESS,
      );
    });
    getSewitAddressList().forEach((walletAddress) => {
      const {addressType} = btcAddressUtils.validateAddress(walletAddress.address);
      expect(addressType).to.eql(
        constants.BITCOIN_SEGWIT_ADDRESS,
      );
    });
  });

});
