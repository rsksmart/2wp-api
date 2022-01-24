import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';

describe('Pegin configuration Controller', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('invokes GET /pegin-configuration', async () => {
    const res = await client.get('/pegin-configuration').expect(200);
    const peginConf = res.body;
    const legacyRegex = new RegExp('^[mn][1-9A-HJ-NP-Za-km-z]{26,35}');
    const segwitRegex = new RegExp('^[2][1-9A-HJ-NP-Za-km-z]{26,35}');
    expect(peginConf.minValue).to.be.Number();
    expect(peginConf.maxValue).to.be.Number();
    expect(peginConf.maxValue > peginConf.minValue).to.be.true();
    expect(
      legacyRegex.test(peginConf.federationAddress) ||
      segwitRegex.test(peginConf.federationAddress),
    ).to.be.true();
    expect(peginConf.btcConfirmations).to.be.Number();
  });
});
