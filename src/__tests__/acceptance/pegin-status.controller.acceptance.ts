import {Client} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';

describe('Pegin Status Controller', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('invokes GET /get-pegin-status with a txId', async () => {
    const response = await client
      .get('/get-pegin-status')
      .send({
        txId: 'btcTxId',
      })
      .expect(200);
    console.log(response.text);
  });
});
