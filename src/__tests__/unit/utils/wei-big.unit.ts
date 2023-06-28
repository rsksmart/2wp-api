import {expect} from '@loopback/testlab';
import Big from 'big.js';
import WeiBig from '../../../utils/WeiBig';

describe('WeiBig', () => {
  it('should be a valid instance passing string, integer and big values', () => {
    const wb1:WeiBig = new WeiBig(500000, 'wei');
    expect(wb1).to.be.instanceOf(Big);
    expect(wb1.toString()).to.be.eql('500000');
    const wb2:WeiBig = new WeiBig('500000', 'rbtc');
    expect(wb2).to.be.instanceOf(Big);
    expect(wb2.toWeiString()).to.be.eql('500000000000000000000000');
    const sb3:WeiBig = new WeiBig(new Big('1'), 'mwei');
    expect(sb3).to.be.instanceOf(Big);
    expect(sb3.toWeiString()).to.be.eql('1000000');
  });
  it('should perform valid sum operations with the same instance class', () => {
    const wb1:WeiBig = new WeiBig(500000, 'wei');
    const wb2:WeiBig = new WeiBig(500000, 'wei');
    expect(wb1.plus(wb2)).to.be.instanceOf(WeiBig);
    expect(wb1.plus(wb2).toWeiString()).to.be.eql('1000000');
    const wb3:WeiBig = new WeiBig(500000, 'wei');
    const wb4:WeiBig = new WeiBig('0.0000000000005', 'rbtc');
    expect(wb3.plus(wb4)).to.be.instanceOf(WeiBig);
    expect(wb3.plus(wb4).toWeiString()).to.be.eql('1000000');
  });
  it('should perform valid multiply operations with the same instance class', () => {
    const wb1:WeiBig = new WeiBig(500000, 'wei');
    const wb2:WeiBig = new WeiBig(500000, 'wei');
    expect(wb1.mul(wb2)).to.be.instanceOf(WeiBig);
    expect(wb1.mul(wb2).toString()).to.be.eql('250000000000');
    const sb3:WeiBig = new WeiBig(500000, 'wei');
    const sb4 = 0.005;
    expect(sb3.mul(sb4)).to.be.instanceOf(WeiBig);
    expect(sb3.mul(sb4).toString()).to.be.eql('2500');
  });
  it('should perform valid division operations with the same instance class', () => {
    const wb1:WeiBig = new WeiBig(500000, 'wei');
    const wb2:WeiBig = new WeiBig(500000, 'wei');
    expect(wb1.div(wb2)).to.be.instanceOf(WeiBig);
    expect(wb1.div(wb2).toString()).to.be.eql('1');
    const sb3:WeiBig = new WeiBig(500000, 'wei');
    const sb4 = 0.005;
    expect(sb3.div(sb4)).to.be.instanceOf(WeiBig);
    expect(sb3.div(sb4).toString()).to.be.eql('100000000');
  });
  it('should return the string value of the required multiple', () => {
    const wb1:WeiBig = new WeiBig(500000, 'wei');
    expect(wb1.toRBTCString()).to.be.eql('0.000000000000500000');
    const wb2:WeiBig = new WeiBig('500000', 'rbtc');
    expect(wb2.toWeiString()).to.be.eql('500000000000000000000000');
    const sb3:WeiBig = new WeiBig(new Big('1000000'), 'mwei');
    expect(sb3.toGweiTrimmedString()).to.be.eql('1000');
  });
});
