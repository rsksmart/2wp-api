import {Client, expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {setupApplication} from './test-helper';

describe('Tx Controller', () => {
  let app: TwpapiApplication;
  let client: Client;

  before('setupApplication', async () => {
    ({app, client} = await setupApplication());
  });

  after(async () => {
    await app.stop();
  });

  it('invokes GET /tx with txId in query', async () => {
    const testTxId =
      '4abf1cd1dd900b518eeacd293cff7e4f86f38ae21ee23b4fc07693a96b926ae2';
    const tx = await client.get(`/tx?tx=${testTxId}`).expect(200);
    expect(tx.body.vout.length).to.be.eql(3);
    expect(tx.body.blockhash).to.be.eql(
      '0000000000233737e1ceafb6a7c9f506a0d4493e6aceb4bcc123dd36cc232926',
    );
  });
  it('invokes GET /tx with fake txId in query', async () => {
    const testTxId =
      '4abf1cd1dd900b518eeacd293cff7e4f86f38ae21ee23b4fc07693a96b926ae2a5';
    await client.get(`/tx?tx=${testTxId}`).expect(400);
  });
});
