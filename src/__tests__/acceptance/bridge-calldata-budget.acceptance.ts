import {expect} from '@loopback/testlab';
import nock from 'nock';
import sinon from 'sinon';
import {TwpapiApplication} from '../..';
import {MAX_ERROR_RESPONSE_BYTES} from '../../config/resource-budgets';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {RskNodeService} from '../../services/rsk-node.service';
import {BRIDGE_METHODS, getBridgeSignature} from '../../utils/bridge-utils';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../utils/resource-budget';
import {
  installRskRpcMock,
  restoreRskRpcMock,
} from '../fixtures/rsk-rpc.mock';
import {bindPermissiveRateLimiter, setupApplication} from './test-helper';

const BRIDGE = '0x0000000000000000000000000000000001000006';
/** `registerFastBridgeBtcTransaction` — permissionless, and not a pegout method. */
const FLYOVER_SELECTOR = '0x6adc0133';

const OVERSIZED_HASH = `0x${'ab'.repeat(32)}`;
const FLYOVER_HASH = `0x${'cd'.repeat(32)}`;
/**
 * A real pegout request, recorded from testnet: value sent to the Bridge with
 * empty calldata, mined successfully. This is the transaction that must keep
 * working — a mis-calibrated bound does not break loudly, it leaves legitimate
 * pegouts in a state that never resolves.
 */
const REAL_PEGOUT_HASH =
  '0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66';

/**
 * The 84419 shape: four dynamic `bytes` parameters whose offsets all point at
 * the same blob, so the decoder materializes it once per parameter. Every offset
 * is in bounds — nothing about the bytes is malformed, and following them is
 * what allocates.
 *
 * Carried behind an allowlisted selector on purpose: the selector check runs
 * first and is cheaper, so a flyover payload never reaches the size bound. To
 * exercise the size bound, the calldata has to be something the route would
 * otherwise agree to decode.
 */
const aliasedOffsetsCalldata = (bytes: number, selector: string): string => {
  const word = (n: number) => n.toString(16).padStart(64, '0');
  const blobWords = Math.max(1, Math.floor(bytes / 32));
  const blobOffset = 4 * 32;
  const head = word(blobOffset).repeat(4);
  const blob = word(blobWords * 32) + 'ab'.repeat(blobWords * 32);
  return `${selector}${head}${blob}`;
};

/**
 * The public reproduction of Immunefi 84419, and its false-positive control.
 *
 * `GET /tx-status-by-type/{txId}/PEGOUT` is unauthenticated and, on a database
 * miss, re-parses the transaction from the node. The receipt gate that used to
 * guard that decode does not hold — `registerFastBridgeBtcTransaction` returns
 * GENERIC_ERROR rather than reverting, so hostile calldata carries a `status: 1`
 * receipt and walks through it.
 */
describe('Bridge calldata budget (Acceptance)', () => {
  let app: TwpapiApplication;
  let baseUrl: string;
  let rskNodeService: RskNodeService;
  let realGetTransaction: RskNodeService['web3']['eth']['getTransaction'];
  let realGetTransactionReceipt: RskNodeService['web3']['eth']['getTransactionReceipt'];

  const stubbedTransactions: Record<string, unknown> = {
    [OVERSIZED_HASH]: {
      hash: OVERSIZED_HASH,
      blockHash: `0x${'11'.repeat(32)}`,
      blockNumber: 8_000_000n,
      input: aliasedOffsetsCalldata(
        1536 * 1024,
        getBridgeSignature(BRIDGE_METHODS.RELEASE_BTC),
      ),
      to: BRIDGE,
      from: `0x${'33'.repeat(20)}`,
      value: 0n,
    },
    [FLYOVER_HASH]: {
      hash: FLYOVER_HASH,
      blockHash: `0x${'11'.repeat(32)}`,
      blockNumber: 8_000_000n,
      input: aliasedOffsetsCalldata(1536 * 1024, FLYOVER_SELECTOR),
      to: BRIDGE,
      from: `0x${'33'.repeat(20)}`,
      value: 0n,
    },
  };

  before('setupApplication', async function () {
    this.timeout(60000);
    // Pins RSK_NODE_HOST and replays recorded responses, so the legitimate
    // pegout below runs against real captured bytes with no network.
    installRskRpcMock();
    // The mock forbids all real connections, which includes the loopback the
    // client uses to reach the app under test. Re-allow exactly that: anything
    // else still fails loudly rather than quietly reaching the network.
    nock.enableNetConnect(/(127\.0\.0\.1|localhost|\[::1\])/);
    ({app} = await setupApplication());
    bindPermissiveRateLimiter(app);
    baseUrl = app.restServer.url!;

    // The pegout lookup consults the database first and the harness loads no
    // `.env`, so without this the database hop fails on defaults and the code
    // under test is never reached.
    app.bind(ServicesBindings.PEGOUT_STATUS_DATA_SERVICE).to({
      getLastByOriginatingRskTxHashNewest: async () => undefined,
      getManyByBtcRecipientAddress: async () => [],
      getLastByOriginatingRskTxHash: async () => undefined,
      set: async () => undefined,
      start: async () => undefined,
      stop: async () => undefined,
    } as never);

    rskNodeService = await app.get(ServicesBindings.RSK_NODE_SERVICE);
    realGetTransaction = rskNodeService.web3.eth.getTransaction;
    realGetTransactionReceipt = rskNodeService.web3.eth.getTransactionReceipt;

    // Only the synthetic hashes are answered from here; everything else falls
    // through to the recorded fixtures.
    rskNodeService.web3.eth.getTransaction = (async (hash: string) =>
      stubbedTransactions[hash] ??
      realGetTransaction.call(rskNodeService.web3.eth, hash)) as never;
    rskNodeService.web3.eth.getTransactionReceipt = (async (hash: string) =>
      stubbedTransactions[hash]
        ? {
            // status 1: exactly what the old receipt gate accepted.
            status: 1n,
            transactionHash: hash,
            blockNumber: 8_000_000n,
            to: BRIDGE,
            from: `0x${'33'.repeat(20)}`,
            logs: [],
          }
        : realGetTransactionReceipt.call(rskNodeService.web3.eth, hash)) as never;
  });

  after(async () => {
    sinon.restore();
    await app.stop();
    restoreRskRpcMock();
  });

  beforeEach(resetMetricCounters);

  it('answers boundedly to 1.5 MiB of adversarial calldata', async () => {
    const res = await fetch(
      `${baseUrl}/tx-status-by-type/${OVERSIZED_HASH}/PEGOUT`,
      {signal: AbortSignal.timeout(15000)},
    );
    const body = await res.text();

    // This route's contract is a 200 carrying a status type; every failure mode
    // it has is already flattened to one. What matters here is that the answer
    // is bounded and carries none of the payload — not which number it wears.
    expect(res.status).to.be.oneOf([200, 413, 500]);
    expect(body).to.not.match(/abab/);
    expect(body.length).to.be.below(MAX_ERROR_RESPONSE_BYTES);
  }).timeout(30000);

  it('records the violation as a scalar, so it can be alerted on', async () => {
    await fetch(`${baseUrl}/tx-status-by-type/${OVERSIZED_HASH}/PEGOUT`, {
      signal: AbortSignal.timeout(15000),
    });

    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.BRIDGE_CALLDATA_BYTES,
      }),
    ).to.equal(1);
  }).timeout(30000);

  it('refuses the flyover method by selector, before the size bound', async () => {
    const res = await fetch(
      `${baseUrl}/tx-status-by-type/${FLYOVER_HASH}/PEGOUT`,
      {signal: AbortSignal.timeout(15000)},
    );
    const body = await res.text();

    expect(body).to.not.match(/abab/);
    expect(res.status).to.be.oneOf([200, 413, 500]);
    // The cheaper, more specific check runs first, so the size bound is never
    // consulted. Both refuse it; only one of them gets to.
    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.BRIDGE_CALLDATA_BYTES,
      }),
    ).to.equal(0);
  }).timeout(30000);

  it('keeps serving afterwards', async () => {
    const res = await fetch(`${baseUrl}/api`);

    expect(res.status).to.equal(200);
  }).timeout(30000);

  it('still decodes a real pegout, and reports no violation for it', async () => {
    // The control that matters most in six months. A bound set too low does not
    // break loudly — it leaves legitimate pegouts in a status that never
    // resolves, and nothing says so.
    const res = await fetch(
      `${baseUrl}/tx-status-by-type/${REAL_PEGOUT_HASH}/PEGOUT`,
      {signal: AbortSignal.timeout(15000)},
    );

    expect(res.status).to.equal(200);
    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.BRIDGE_CALLDATA_BYTES,
      }),
    ).to.equal(0);
  }).timeout(30000);
});
