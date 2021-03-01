import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';

describe('Tx Fee Controller', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('invokes GET /tx-fee', async () => {
    const txFee = await client.get('/tx-fee').expect(200);
  });
});
