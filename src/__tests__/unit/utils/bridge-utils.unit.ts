import {expect} from '@loopback/testlab';
import {isSuccessfulReceipt} from '../../../utils/bridge-utils';

describe('Utils: bridge-utils', () => {
  describe('isSuccessfulReceipt', () => {
    // web3 and ethers each report status differently depending on the call
    // path, so every known success representation has to be recognized.
    [1, 1n, true, '0x1', '1'].forEach(status => {
      it(`accepts a successful receipt reported as ${typeof status} ${String(status)}`, () => {
        expect(isSuccessfulReceipt({status})).to.be.true();
      });
    });

    [0, 0n, false, '0x0', '0'].forEach(status => {
      it(`rejects a reverted receipt reported as ${typeof status} ${String(status)}`, () => {
        expect(isSuccessfulReceipt({status})).to.be.false();
      });
    });

    it('rejects a missing receipt', () => {
      expect(isSuccessfulReceipt(null)).to.be.false();
      expect(isSuccessfulReceipt(undefined)).to.be.false();
    });

    it('rejects a receipt with no status field', () => {
      expect(isSuccessfulReceipt({})).to.be.false();
    });

    // Fail closed: a status we cannot interpret is not evidence of success.
    ['0x2', 2, 'success', {}, [], NaN].forEach(status => {
      it(`rejects an unrecognized status ${JSON.stringify(status) ?? String(status)}`, () => {
        expect(isSuccessfulReceipt({status})).to.be.false();
      });
    });

    it('does not treat a truthy receipt object as success on its own', () => {
      // This is the gap being closed: the previous guard was `if (receipt)`.
      const revertedButTruthy = {status: 0, blockNumber: 1, logs: []};
      expect(!!revertedButTruthy).to.be.true();
      expect(isSuccessfulReceipt(revertedButTruthy)).to.be.false();
    });
  });
});
