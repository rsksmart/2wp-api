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
    expect(res.body).to.containEql({
      id: 1,
      minValue: 100000,
      maxValue: 100000000000000,
      federationAddress: 'tb1qtanvhhl8ve32tcdxkrsamyy6vq5p62ctdv89l0',
      feePerKb: 10,
      btcConfirmations: 100,
    });
  });
});
