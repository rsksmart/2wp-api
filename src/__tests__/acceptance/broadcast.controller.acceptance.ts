import {Client} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication, bindPermissiveRateLimiter} from './test-helper';

describe('Broadcast Controller', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
    bindPermissiveRateLimiter(app);
  });

  after(async () => {
    await app.stop();
  });

  it('invokes POST /broadcast with value on hex', async () => {
    await client
      .post('/broadcast')
      .send({
        data: 'value on hex',
      })
      .expect(422);
  });
});
