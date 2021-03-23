import {expect} from '@loopback/testlab';
import {AccountBalance} from '../../models';
import {
  getLegacyAddressList,
  getNativeSegwitAddressList,
  getSewitAddressList,
} from '../helper';
import * as constants from '../../constants';

describe('Account Balance Model ', () => {
  it('Validate the account type given an address', () => {
    getLegacyAddressList().forEach(walletAddress => {
      expect(AccountBalance.getAccountType(walletAddress.address)).to.eql(
        constants.BITCOIN_LEGACY_ADDRESS,
      );
    });
    getNativeSegwitAddressList().forEach(walletAddress => {
      expect(AccountBalance.getAccountType(walletAddress.address)).to.eql(
        constants.BITCOIN_NATIVE_SEGWIT_ADDRESS,
      );
    });
    getSewitAddressList().forEach(walletAddress => {
      expect(AccountBalance.getAccountType(walletAddress.address)).to.eql(
        constants.BITCOIN_SEGWIT_ADDRESS,
      );
    });
  });
});
