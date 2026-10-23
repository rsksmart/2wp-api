import nock from 'nock';
import {ethers} from 'ethers';
import * as precompiledAbis from '@rsksmart/rsk-precompiled-abis';
import {TwpapiApplication} from '../..';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {expect} from '@loopback/testlab';
import {bindPermissiveRateLimiter, setupApplication} from './test-helper';

const RSK_ORIGIN = new URL(process.env.RSK_NODE_HOST!).origin;
const iface = new ethers.Interface(precompiledAbis.bridge.abi);
const TX = 'ab'.repeat(32);

let calls: string[] = [];

const answerOne = (b: {method?: string; params?: unknown[]; id?: unknown}) => {
  const id = b.id ?? 1;
  const reply = (result: unknown) => ({jsonrpc: '2.0', id, result});
  const label =
    b.method === 'eth_call'
      ? `eth_call ${String((b.params?.[0] as {data?: string})?.data ?? '').slice(0, 10)}`
      : String(b.method);
  calls.push(label);
  switch (b.method) {
    case 'eth_chainId': return reply('0x1f');
    case 'net_version': return reply('31');
    case 'eth_blockNumber': return reply('0x7a1200');
    case 'eth_getBalance': return reply('0x0');
    case 'eth_getTransactionByHash': return reply(null);
    case 'eth_getTransactionReceipt': return reply(null);
    case 'eth_call': {
      const d = String((b.params?.[0] as {data?: string})?.data ?? '');
      if (d.startsWith(iface.getFunction('getFederationAddress')!.selector))
        return reply(iface.encodeFunctionResult('getFederationAddress', ['2NFed']));
      if (d.startsWith(iface.getFunction('getMinimumLockTxValue')!.selector))
        return reply(iface.encodeFunctionResult('getMinimumLockTxValue', [1]));
      if (d.startsWith(iface.getFunction('getLockingCap')!.selector))
        return reply(iface.encodeFunctionResult('getLockingCap', [1]));
      return reply('0x' + '0'.repeat(64));
    }
    default: return reply('0x0');
  }
};

/**
 * How many JSON-RPC calls one HTTP request makes to the RSK node.
 *
 * Counted on the wire rather than at a stub, and asserted as a ceiling rather
 * than an exact number: the point is that the count is a *constant* per route and
 * not a function of anything a client supplies. One of these routes used to issue
 * a call per output of a Bitcoin transaction whose id the client chose, which is
 * the shape this guards against returning.
 *
 * Unlike Blockbook, the RSK calls sit inside `ethers.Contract` and `web3.eth`
 * rather than in a client of ours, so there is no permit pool bounding how many
 * run at once process-wide. That is a deliberate open item: with per-request
 * volume this small and constant, a pool would bound concurrency that the rate
 * limiter already bounds by requests, and building one before measuring the real
 * load would be building a control that does nothing. These numbers are the
 * baseline that decision rests on.
 */
describe('RSK node call volume (Acceptance)', () => {
  let app: TwpapiApplication;
  let baseUrl: string;

  before(async function () {
    this.timeout(60000);
    ({app} = await setupApplication());
    bindPermissiveRateLimiter(app);
    baseUrl = app.restServer.url!;
    // Blockbook is not the subject; it answers in sync and finds no transaction,
    // which keeps every route on its RSK path.
    app.bind(ServicesBindings.BITCOIN_SERVICE).to({
      getLastBlock: async () => ({inSync: true, initialSync: false, bestHeight: 1}),
      getTx: async () => undefined,
      getAddressInfo: async () => ({}),
    } as never);
    if (!nock.isActive()) nock.activate();
    nock.disableNetConnect();
    nock.enableNetConnect(/(127\.0\.0\.1|localhost|\[::1\])/);
    nock(RSK_ORIGIN).persist().post(() => true).reply(200, (_u, body) => {
      const p = body as never;
      return Array.isArray(p) ? (p as unknown[]).map(answerOne as never) : answerOne(p);
    });
  });

  after(async () => {
    nock.cleanAll();
    nock.enableNetConnect();
    nock.restore();
    await app.stop();
  });

  /**
   * Measured 2026-09-08, and generous by one so an added `eth_chainId` from a
   * library upgrade is not a failing build. A route that doubles is a real
   * signal.
   */
  const CEILINGS: Array<[string, string, number]> = [
    ['/health', '/health', 4],
    ['/tx-status/{txId}', `/tx-status/${TX}`, 4],
    ['/tx-status-by-type PEGIN', `/tx-status-by-type/${TX}/PEGIN`, 3],
    ['/tx-status-by-type PEGOUT', `/tx-status-by-type/${TX}/PEGOUT`, 2],
    ['/pegin-configuration', '/pegin-configuration', 6],
  ];

  CEILINGS.forEach(([label, path, ceiling]) => {
    it(`keeps ${label} within ${ceiling} calls to the node`, async () => {
      calls = [];

      await fetch(`${baseUrl}${path}`);

      expect(calls.length).to.be.lessThanOrEqual(ceiling);
    }).timeout(60000);
  });

  it('does not scale the call count with the transaction id it is given', async () => {
    // The property that matters. Two different ids must cost the same, because
    // the id is the part a client chooses.
    calls = [];
    await fetch(`${baseUrl}/tx-status/${TX}`);
    const first = calls.length;

    calls = [];
    await fetch(`${baseUrl}/tx-status/${'cd'.repeat(32)}`);

    expect(calls.length).to.equal(first);
  }).timeout(60000);
});
