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
    // const response = await client
    //   .get('/get-pegin-status?txId=a8e1281d035e9cdc04a0a1e8a926b4fb66de7ef4f2157470e0160434cf7679f2')
    //   .expect(200);
    // console.log(response.text);
  });
});
