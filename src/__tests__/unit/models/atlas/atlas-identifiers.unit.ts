import {expect} from '@loopback/testlab';
import {
  normalizeAddress,
  normalizeSwapId,
} from '../../../../models/atlas/atlas-identifiers';

describe('Model: atlas-identifiers', () => {

  describe('normalizeSwapId', () => {
    it('adds the 0x prefix when the log omits it', () => {
      expect(normalizeSwapId('1f789f91cb5cb6f76b91f19adcc89233'))
        .to.equal('0x1f789f91cb5cb6f76b91f19adcc89233');
    });

    it('lowercases a mixed-case hash', () => {
      expect(normalizeSwapId('0x1F789F91CB5CB6F76B91F19ADCC89233'))
        .to.equal('0x1f789f91cb5cb6f76b91f19adcc89233');
    });

    it('leaves an already normalized hash untouched', () => {
      const hash = '0x1f789f91cb5cb6f76b91f19adcc89233f3447d7228d8798c4e94ef09fd6d8950';

      expect(normalizeSwapId(hash)).to.equal(hash);
    });

    it('throws on an empty value rather than emitting an empty swap_id', () => {
      expect(() => normalizeSwapId('')).to.throw(/swap_id/);
      expect(() => normalizeSwapId('   ')).to.throw(/swap_id/);
      expect(() => normalizeSwapId(undefined)).to.throw(/swap_id/);
      expect(() => normalizeSwapId(null)).to.throw(/swap_id/);
    });
  });

  describe('normalizeAddress', () => {
    it('lowercases a checksummed Rootstock address', () => {
      expect(normalizeAddress('0x2D623170Cb518434af6c02602334610f194818c1'))
        .to.equal('0x2d623170cb518434af6c02602334610f194818c1');
    });

    // base58 is case sensitive: lowercasing a Bitcoin address destroys it.
    it('leaves a Bitcoin address untouched', () => {
      for (const address of [
        'mfWxJ45yp2SFn7UciZyNpvDKrzbhyfKrY8',
        '2N6JWYUb6Li4Kux6UB2eihT7n3rm3YX97uv',
        'tb1qEXAMPLEmixedCase',
      ]) {
        expect(normalizeAddress(address)).to.equal(address);
      }
    });

    it('keeps a missing address null instead of inventing one', () => {
      expect(normalizeAddress(undefined)).to.be.null();
      expect(normalizeAddress(null)).to.be.null();
      expect(normalizeAddress('')).to.be.null();
    });
  });

});
