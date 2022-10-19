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

  it('invokes GET /tx-status with a txId', async () => {
    const txId = '73be84f8b6fe2875d5988614aad7ba9c976e37c64a9af2099633a25f119f41f4';
    return client
      .get(`/tx-status/${txId}`)
      .expect(200);
  }).timeout(15000);
});
