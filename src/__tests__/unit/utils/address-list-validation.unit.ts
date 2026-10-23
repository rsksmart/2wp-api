import {expect} from '@loopback/testlab';
import {VALIDATION_ERROR_CODE} from '../../../middleware/bounded-error-writer';
import {validateAddressList} from '../../../utils/address-list-validation';

const ADDRESS = 'mzMCEHDUAZaKL9BXt9SzasFPUUqM77TqP1';

const caught = (fn: () => void): any => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

describe('Utils: address list validation', () => {
  it('accepts a list within the limit', () => {
    expect(() => validateAddressList([ADDRESS], {maxItems: 2})).to.not.throw();
  });

  describe('rejections carry the shared validation contract', () => {
    // maxItems is per case so each rejection branch is the one actually reached.
    const cases: [string, string[], number, string][] = [
      ['an empty list', [], 1, 'addressList must not be empty'],
      ['too many items', [ADDRESS, `${ADDRESS}x`], 1, 'addressList exceeds maximum of 1 items'],
      ['duplicates', [ADDRESS, ADDRESS], 2, 'addressList must not contain duplicate addresses'],
    ];

    cases.forEach(([label, list, maxItems, message]) => {
      it(`rejects ${label} with a 422 and the shared code`, () => {
        const err = caught(() => validateAddressList(list, {maxItems}));

        expect(err).to.not.be.null();
        expect(err.statusCode).to.equal(422);
        // Same code Ajv failures get, so the two 422 producers are
        // indistinguishable to a client.
        expect(err.code).to.equal(VALIDATION_ERROR_CODE);
        expect(err.message).to.equal(message);
      });
    });
  });
});
