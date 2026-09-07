import {expect} from '@loopback/testlab';
import nock from 'nock';
import {ethers} from 'ethers';
import * as precompiledAbis from '@rsksmart/rsk-precompiled-abis';
import {TwpapiApplication} from '../..';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {BitcoinTx} from '../../models/bitcoin-tx.model';
import {Vin} from '../../models/vin.model';
import {Vout} from '../../models/vout.model';
import {bindPermissiveRateLimiter, setupApplication} from './test-helper';

const TX_ID = 'a'.repeat(64);
const SENDER = '2N69faB9UEHB7QyiAiQv3n2GsMM9xXnFE5W';
const FED_A = '2MyFederationAddressAaaaaaaaaaaaaaaa';
const FED_B = '2MyFederationAddressBbbbbbbbbbbbbbbb';
const OUTPUTS = 500;

const bridgeInterface = new ethers.Interface(precompiledAbis.bridge.abi);
const FED_SELECTOR = bridgeInterface.getFunction('getFederationAddress')!.selector;

/**
 * Read at module load, which is when the `BridgeService` under test captured it.
 *
 * That service is constructed at import time, so the host it will talk to is
 * fixed before any hook runs. Another suite may repoint `RSK_NODE_HOST` while it
 * runs and put it back afterwards; intercepting the origin captured here is what
 * stays correct either way.
 */
const RSK_ORIGIN = new URL(process.env.RSK_NODE_HOST!).origin;

const givenTx = (fedAddress: string): BitcoinTx => {
  const tx = new BitcoinTx();
  tx.txId = TX_ID;
  const vin = new Vin();
  vin.addresses = [SENDER];
  tx.vin = [vin];
  // The federation output is last, so the loop runs its full length before
  // finding it — the worst case that still resolves to a real pegin.
  tx.vout = [
    ...Array.from({length: OUTPUTS - 1}, (_, i) => {
      const vout = new Vout();
      vout.isAddress = true;
      vout.addresses = [`2NotAFederationAddress${i}`];
      vout.value = 0;
      vout.hex = 'a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b987';
      return vout;
    }),
    (() => {
      const vout = new Vout();
      vout.isAddress = true;
      vout.addresses = [fedAddress];
      vout.value = 500000;
      vout.hex = 'a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b987';
      return vout;
    })(),
  ];
  tx.hex =
    '020000000001019b42ab3e8e2f29173cc440544b6d8bdcd7d46ff6197035f06ce38ae92fbd89260100000000fdffffff02b00400000000000017a91457f76bf3ab818811c740929ac7a5e3ef8c7a34b98714a6130000000000160014438ba205a91b42778afc09ada1ad567596fdb1990247304402202149f5201c13d0b33d5dfc8af09d1b95920b409f6c05056eac70a79c202d92e2022031bebf341c45dd64166219f21c49de4c45357657bfc2fdd78f11336af53cc366012103284708827bfced592524611c7a3963a8ae634088d9265a32d6ccc12cbc16b111277f1f00';
  // Below BTC_CONFIRMATIONS, so the answer is WAITING_CONFIRMATIONS and the
  // lookup never reaches the database.
  tx.confirmations = 1;
  return tx;
};

/**
 * One `eth_call` per request, counted at the node rather than at a stub.
 *
 * The unit tests count calls to a stubbed method. This counts JSON-RPC requests
 * that actually left the process, which is the claim that matters: the federation
 * lookup used to put one `eth_call` on the wire for every output of a Bitcoin
 * transaction whose txid the client chose.
 *
 * `nock` rather than a stub server because the `BridgeService` behind the lookup
 * is constructed at module import time, before any hook here could repoint
 * `RSK_NODE_HOST` at a local address. Intercepting by host works whenever the
 * provider was built.
 */
describe('Federation address fan-out (Acceptance)', () => {
  let app: TwpapiApplication;
  let baseUrl: string;
  let previousHistory: string | undefined;
  let fedAddress = FED_A;
  let ethCalls: string[] = [];

  /** The shape of the answer these tests read, narrowed from `unknown`. */
  interface TxStatusBody {
    type: string;
    txDetails?: {btc?: {federationAddress?: string}};
  }

  const readBody = async (res: Response): Promise<TxStatusBody> =>
    (await res.json()) as TxStatusBody;

  const fedCallCount = () =>
    ethCalls.filter(data => data.startsWith(FED_SELECTOR)).length;

  interface RpcCall {
    method?: string;
    params?: unknown[];
    id?: unknown;
  }

  /**
   * ethers batches JSON-RPC calls into an array, so the body is not always one
   * object — and answering a batch with a single object produces a `BAD_DATA`
   * "missing response for request" that looks nothing like a counting problem.
   */
  const answerRpc = (body: RpcCall | RpcCall[]) =>
    Array.isArray(body) ? body.map(answerOne) : answerOne(body);

  const answerOne = (body: RpcCall) => {
    const id = body.id ?? 1;
    const reply = (result: unknown) => ({jsonrpc: '2.0', id, result});
    switch (body.method) {
      case 'eth_chainId':
        return reply('0x1f');
      case 'net_version':
        return reply('31');
      case 'eth_blockNumber':
        return reply('0x7a1200');
      case 'eth_call': {
        const data = String(
          (body.params?.[0] as {data?: string} | undefined)?.data ?? '',
        );
        ethCalls.push(data);
        if (data.startsWith(FED_SELECTOR)) {
          return reply(
            bridgeInterface.encodeFunctionResult('getFederationAddress', [
              fedAddress,
            ]),
          );
        }
        return reply(
          bridgeInterface.encodeFunctionResult('getMinimumLockTxValue', [1]),
        );
      }
      default:
        return reply('0x0');
    }
  };

  before('setupApplication', async function () {
    this.timeout(60000);
    previousHistory = process.env.FEDERATION_ADDRESSES_HISTORY;
    // The federation is whatever the node says it is, and nothing else, so a
    // federation change is visible in the answers rather than masked by a
    // configured history that already contains both addresses.
    process.env.FEDERATION_ADDRESSES_HISTORY = '';

    ({app} = await setupApplication());
    bindPermissiveRateLimiter(app);
    baseUrl = app.restServer.url!;

    // Blockbook is not the subject: it answers in sync, and hands back the
    // transaction whose outputs drive the loop.
    app.bind(ServicesBindings.BITCOIN_SERVICE).to({
      getLastBlock: async () => ({inSync: true, initialSync: false, bestHeight: 1}),
      getTx: async () => givenTx(fedAddress),
    } as never);

    // `nock` installs a global interceptor on import, and other suites in this
    // process uninstall it again with `nock.restore()` when they finish. Without
    // re-activating, the interceptor below is registered against a nock that is
    // not listening, the calls go to the real network, and the count stays at
    // zero — which reads like a memoization bug rather than a harness one.
    if (!nock.isActive()) {
      nock.activate();
    }
    nock.disableNetConnect();
    // Except the loopback the test client uses to reach the app under test.
    // Anything else still fails loudly rather than quietly reaching the network.
    nock.enableNetConnect(/(127\.0\.0\.1|localhost|\[::1\])/);

    nock(RSK_ORIGIN)
      .persist()
      .post(() => true)
      .reply(200, (_uri, body) => answerRpc(body as never));
  });

  after(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    nock.restore();
    if (previousHistory === undefined) {
      delete process.env.FEDERATION_ADDRESSES_HISTORY;
    } else {
      process.env.FEDERATION_ADDRESSES_HISTORY = previousHistory;
    }
    await app.stop();
  });

  beforeEach(() => {
    ethCalls = [];
    fedAddress = FED_A;
  });

  it('puts one getFederationAddress call on the wire for a 500-output transaction', async () => {
    const res = await fetch(`${baseUrl}/tx-status/${TX_ID}`);

    expect(res.status).to.equal(200);
    expect((await readBody(res)).type).to.equal('PEGIN');
    expect(fedCallCount()).to.equal(1);
  }).timeout(60000);

  it('makes two calls for two requests, not one', async () => {
    // The other half of the contract, and the half people forget. If this ever
    // reads 1, a process-wide cache has been introduced and the staleness
    // question below comes with it.
    await fetch(`${baseUrl}/tx-status/${TX_ID}`);
    await fetch(`${baseUrl}/tx-status/${TX_ID}`);

    expect(fedCallCount()).to.equal(2);
  }).timeout(60000);

  it('sees a federation change on the very next request', async () => {
    // §2 of the plan as an executable assertion. Per-request scope was chosen
    // over a process TTL precisely so this holds: during a federation change, a
    // pegin to the new federation is classified correctly immediately rather
    // than after an entry expires. A TTL cache turns this test red, which is the
    // conversation worth having with the facts present.
    fedAddress = FED_A;
    const before = await fetch(`${baseUrl}/tx-status/${TX_ID}`);
    expect((await readBody(before)).txDetails?.btc?.federationAddress).to.equal(
      FED_A,
    );

    fedAddress = FED_B;
    const after = await fetch(`${baseUrl}/tx-status/${TX_ID}`);

    expect((await readBody(after)).txDetails?.btc?.federationAddress).to.equal(
      FED_B,
    );
  }).timeout(60000);
});
