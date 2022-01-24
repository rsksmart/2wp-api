import {expect} from '@loopback/testlab';
import {BridgeService} from '../../services';

describe('Service: Bridge', () => {
  const bridgeService = new BridgeService();

  it('should return a valid BTC segwit or legacy federation address ', async () => {
    const legacyRegex = new RegExp('^[mn][1-9A-HJ-NP-Za-km-z]{26,35}');
    const segwitRegex = new RegExp('^[2][1-9A-HJ-NP-Za-km-z]{26,35}');
    const address = await bridgeService.getFederationAddress();
    expect(legacyRegex.test(address) || segwitRegex.test(address)).to.be.true();
  });
  it('should return the min value to pegin from bridge', async () => {
    const minValue = await bridgeService.getMinPeginValue();
    expect(minValue).to.be.Number();
  });
  it('return the Locking Cap from bridge', async () => {
    const lockingCap = await bridgeService.getLockingCapAmount();
    expect(lockingCap).to.be.Number();
  });
});
