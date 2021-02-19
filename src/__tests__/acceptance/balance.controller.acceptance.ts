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

  it('invokes POST /balance', async () => {
    const res = await client
      .post('/balance')
      .send({
        sessionId: 'fc46727917d500fa5bb0c696d5d0e682',
        addressList: [
          {
            path: [2147483692, 2147483649, 2147483648, 0, 0],
            serializedPath: "m/44'/1'/0'/0/0",
            address: 'mzMCEHDUAZaKL9BXt9SzasFPUUqM77TqP1',
          },
          {
            path: [2147483692, 2147483649, 2147483648, 1, 0],
            serializedPath: "m/44'/1'/0'/1/0",
            address: 'mqCjBpQ75Y5sSGzFtJtSQQZqhJze9eaKjV',
          },
          {
            path: [2147483697, 2147483649, 2147483648, 0, 0],
            serializedPath: "m/49'/1'/0'/0/0",
            address: '2NC4DCae9HdL6vjWMDbQwTkYEAB22MF3TPs',
          },
          {
            path: [2147483697, 2147483649, 2147483648, 1, 0],
            serializedPath: "m/49'/1'/0'/1/0",
            address: '2NCZ2CNYiz4rrHq3miUHerUMcLyeWU4gw9C',
          },
          {
            path: [2147483732, 2147483649, 2147483648, 0, 0],
            serializedPath: "m/84'/1'/0'/0/0",
            address: 'tb1qtanvhhl8ve32tcdxkrsamyy6vq5p62ctdv89l0',
          },
          {
            path: [2147483732, 2147483649, 2147483648, 1, 0],
            serializedPath: "m/84'/1'/0'/1/0",
            address: 'tb1qfuk3j0l4qn4uzstc47uwk68kedmjwuucl7avqr',
          },
        ],
      })
      .expect(200);
    expect(res.body).to.containEql({
      segwit: 0,
      nativeSegwit: 49997000,
      legacy: 3289478,
    });
  });
});
