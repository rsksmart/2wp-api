import {expect} from '@loopback/testlab';
import nock from 'nock';
import {
  BroadcastProvider,
  FeeLevelProvider,
  LastBlockServiceProvider,
  TxServiceProvider,
  TxV2ServiceProvider,
} from '../../../services';

const HOST = 'http://blockbook.test';

/**
 * The one seam in this file.
 *
 * Everything below asserts the *contract* — what each service resolves to for a
 * given Blockbook response — and none of it changed when the implementation
 * behind it did. Wiring lives here so the assertions never had to move: while
 * two services were still on the REST connector this map had to redirect their
 * datasources, because those read `BLOCKBOOK_URL` once at module load. All five
 * now resolve their URL per call, so the map is uniform and the `before` hook is
 * enough.
 */
const services = {
  tx: () => new TxServiceProvider().value(),
  txV2: () => new TxV2ServiceProvider().value(),
  fee: () => new FeeLevelProvider().value(),
  broadcast: () => new BroadcastProvider().value(),
  lastBlock: () => new LastBlockServiceProvider().value(),
};

/**
 * The contract the REST connector produces **today**, pinned before the
 * migration to the bounded client.
 *
 * These are characterization tests, not aspirational ones. They record what the
 * five Blockbook services actually return, including the parts nobody designed:
 * every one of them resolves to a **one-element array**, because
 * `responsePath: '$'` is a JSONPath expression and JSONPath always yields a list
 * of matches. Three of the five declare a non-array return type in TypeScript
 * and are wrong about it — `bitcoin.service.ts` casts to `any` and reads `tx[0]`,
 * which is the only reason it works.
 *
 * **These tests do not get updated by the migration.** They are the contract, and
 * they must keep passing word for word against the bounded implementation. If one
 * has to change, that is a regression to justify in the PR, not a test to
 * refresh.
 */
describe('Services: Blockbook response shapes (characterization)', () => {
  let previousBlockbookUrl: string | undefined;

  before(() => {
    previousBlockbookUrl = process.env.BLOCKBOOK_URL;
    process.env.BLOCKBOOK_URL = `${HOST}/`;
    if (!nock.isActive()) {
      nock.activate();
    }
  });

  after(() => {
    process.env.BLOCKBOOK_URL = previousBlockbookUrl;
    nock.cleanAll();
    nock.enableNetConnect();
    nock.restore();
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  describe('txProvider — GET /api/v1/tx/{txId}', () => {
    const recordedTx = {
      txid: 'abc',
      version: 1,
      vin: [{n: 0}],
      vout: [{n: 0}],
      blockhash: '0000',
      blockheight: 800000,
      confirmations: 12,
      time: 1,
      blocktime: 1,
      valueOut: '1',
      valueIn: '2',
      fees: '3',
      hex: 'deadbeef',
    };

    it('returns a one-element array, not the transaction', async () => {
      const scope = nock(HOST).get('/api/v1/tx/abc').reply(200, recordedTx);

      const result = await (await services.tx()).txProvider('abc');

      // `tx.controller.ts` destructures this with `.then(([tx]) => ...)`. Return
      // the object itself and `tx` is undefined, and `GET /tx` answers an empty
      // object instead of failing.
      expect(result).to.be.an.Array();
      expect(result as unknown[]).to.have.length(1);
      expect((result as unknown as {hex: string}[])[0].hex).to.equal('deadbeef');
    });

    it('preserves the hex field, which is the public contract of GET /tx', async () => {
      // `hex` is a raw Bitcoin transaction and is why these responses can reach
      // megabytes. It is in `tx.model.ts` and in the `Tx` interface: dropping it
      // to make a budget fit would be a breaking change, not a tuning decision.
      nock(HOST)
        .get('/api/v1/tx/big')
        .reply(200, {...recordedTx, hex: 'ab'.repeat(50_000)});

      const [tx] = await (await services.tx()).txProvider('big');

      expect(tx.hex).to.have.length(100_000);
    });
  });

  describe('txV2Provider — GET /api/v2/tx/{txId}', () => {
    it('also returns a one-element array, despite declaring Promise<Txv2>', async () => {
      nock(HOST).get('/api/v2/tx/abc').reply(200, {txid: 'abc', hex: 'dead'});

      const result = await (await services.txV2()).txV2Provider('abc');

      // The declared type says `Txv2`. It is an array, and
      // `bitcoin.service.ts:43` only works because it casts to `any` and reads
      // `tx[0]`.
      expect(result).to.be.an.Array();
      expect(result as unknown[]).to.have.length(1);
      expect((result as unknown as {txid: string}[])[0].txid).to.equal('abc');
    });
  });

  describe('feeProvider — GET /api/v1/estimatefee/{block}', () => {
    const feeService = services.fee;

    it('flattens the object to its values via responsePath $..*', async () => {
      nock(HOST).get('/api/v1/estimatefee/6').reply(200, {result: '0.00012'});

      expect(await (await feeService()).feeProvider(6)).to.deepEqual(['0.00012']);
    });

    it('is a recursive descent, parents before children, in document order', async () => {
      // The full semantics of `$..*`, which the migration has to reproduce.
      // Blockbook only ever sends `{result}`, but the reimplementation is pinned
      // against what the expression actually does, not against the happy path.
      nock(HOST)
        .get('/api/v1/estimatefee/6')
        .reply(200, {result: '0.00012', meta: {a: 1, b: 'x'}});

      expect(await (await feeService()).feeProvider(6)).to.deepEqual([
        '0.00012',
        {a: 1, b: 'x'},
        1,
        'x',
      ]);
    });

    it('descends into array values too', async () => {
      nock(HOST).get('/api/v1/estimatefee/6').reply(200, {result: ['a', 'b']});

      expect(await (await feeService()).feeProvider(6)).to.deepEqual([
        ['a', 'b'],
        'a',
        'b',
      ]);
    });

    it('yields an empty list for an empty object', async () => {
      nock(HOST).get('/api/v1/estimatefee/6').reply(200, {});

      expect(await (await feeService()).feeProvider(6)).to.deepEqual([]);
    });
  });

  describe('broadcast — GET /api/v2/sendtx/{tx}', () => {
    it('puts the raw transaction hex in the URL path, not in a body', async () => {
      // Worth pinning because it is the odd one out: its exposure is request
      // length, not response size, so a response budget does not address it.
      const hex = 'ff00'.repeat(64);
      const scope = nock(HOST)
        .get(`/api/v2/sendtx/${hex}`)
        .reply(200, {result: 'thetxid'});

      const result = await (await services.broadcast()).broadcast(hex);

      expect(scope.isDone()).to.be.true();
      expect(result).to.deepEqual([{result: 'thetxid'}]);
    });

    it('carries the error object through as a one-element array', async () => {
      nock(HOST)
        .get('/api/v2/sendtx/00')
        .reply(200, {error: {message: 'bad tx'}});

      const result = await (await services.broadcast()).broadcast('00');

      // `broadcast.controller.ts` destructures `.then(([txStatus]) => ...)` and
      // reads both `result` and `error` off it.
      expect(result).to.deepEqual([{error: {message: 'bad tx'}}]);
    });
  });

  describe('lastBlockProvider — GET /api/blocks', () => {
    it('returns a one-element array, despite declaring Promise<LastBlockInfoResponse>', async () => {
      const recorded = {
        blockbook: {
          coin: 'Bitcoin',
          host: 'backend',
          version: '0.4.0',
          syncMode: true,
          inSync: true,
          initialSync: false,
          bestHeight: 800000,
        },
        backend: {chain: 'main', blocks: 800000, bestBlockHash: '0000'},
      };
      nock(HOST).get('/api/blocks').reply(200, recorded);

      const result = await (await services.lastBlock()).lastBlockProvider();

      // `bitcoin.service.ts:119` reads `lbir[0].backend.bestBlockHash`.
      expect(result).to.be.an.Array();
      expect(result as unknown[]).to.have.length(1);
      expect(result).to.deepEqual([recorded]);
    });
  });
});
