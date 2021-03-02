import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';
import * as constants from '../../constants';

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
    const peginConf = await client.get('/pegin-configuration').expect(200);
    const txFee = await client.post('/tx-fee')
      .send({
        sessionId: peginConf.body.sessionId,
        amount: 200,
        accountType: constants.BITCOIN_NATIVE_SEGWIT_ADDRESS,
      })
      .expect(200);
  });
});
