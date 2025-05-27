import {stringWeiToDecimalString, stringSatoshiToDecimalString} from '../../../utils/parseUnits';
import {expect} from '@loopback/testlab';

describe('ParseUnits', () => {
  it('should get the decimal string value of a satoshi string', () => {
    const stringValueInSatoshis = "1596";
    expect(stringSatoshiToDecimalString(stringValueInSatoshis)).to.be.eql("0.00001596");
  });
  it('should get the decimal string value of a wei string', () => {
    const stringValueInWei = "79040000000000";
    expect(stringWeiToDecimalString(stringValueInWei)).to.be.eql("0.00007904");
  });
  it('should return zero string value of a satoshi string 0', () => {
    const stringValueInSatoshis = "0";
    expect(stringSatoshiToDecimalString(stringValueInSatoshis)).to.be.eql("0");
  });
  it('should fail if receive a negative number', () => {
    const stringValueInSatoshis = "-10";
    expect(stringSatoshiToDecimalString(stringValueInSatoshis)).to.be.eql("0");
  });
  it('should fail if receive an unexpected character', () => {
    const stringValueInSatoshis = "abc$";
    expect(stringSatoshiToDecimalString(stringValueInSatoshis)).to.be.eql("0");
  });
});