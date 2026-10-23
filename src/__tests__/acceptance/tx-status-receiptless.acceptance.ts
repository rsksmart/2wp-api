import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {TwpapiApplication} from '../..';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {RskNodeService} from '../../services/rsk-node.service';
import {bindPermissiveRateLimiter, setupApplication} from './test-helper';

/**
 * The concrete regression Phase 06 exists to prevent, end to end.
 *
 * A mined transaction whose receipt the node answers `null` for — a reorg
 * between the two RPC calls, or a lagging node in a load-balanced fleet — used to
 * leave the request pending forever, on an unauthenticated route. Reproduced with
 * a stubbed RPC rather than by waiting for a real reorg.
 */
describe('Receipt-less transaction (Acceptance)', () => {
  const TX_HASH = `0x${'ab'.repeat(32)}`;
  let app: TwpapiApplication;
  let baseUrl: string;
  let rskNodeService: RskNodeService;
  let getTransaction: sinon.SinonStub;
  let getTransactionReceipt: sinon.SinonStub;

  before('setupApplication', async function () {
    this.timeout(60000);
    ({app} = await setupApplication());
    bindPermissiveRateLimiter(app);
    baseUrl = app.restServer.url!;

    // The pegout lookup consults the database first, and the acceptance harness
    // does not load `.env`, so the database hop would fail on defaults and never
    // reach the code under test. Stubbing it to "no record" is what puts the
    // receipt-less RSK transaction on the path.
    app
      .bind(ServicesBindings.PEGOUT_STATUS_DATA_SERVICE)
      .to({
        getLastByOriginatingRskTxHashNewest: async () => undefined,
        getManyByBtcRecipientAddress: async () => [],
        getLastByOriginatingRskTxHash: async () => undefined,
        set: async () => undefined,
        start: async () => undefined,
        stop: async () => undefined,
      } as never);

    rskNodeService = await app.get(ServicesBindings.RSK_NODE_SERVICE);
    getTransaction = sinon.stub().resolves({
      hash: TX_HASH,
      // Mined: both present, so the receipt is fetched.
      blockHash: `0x${'11'.repeat(32)}`,
      blockNumber: 8_000_000n,
      input: '0x',
      to: `0x${'22'.repeat(20)}`,
      from: `0x${'33'.repeat(20)}`,
      value: 0n,
    });
    // The node has the transaction but not (yet) its receipt.
    getTransactionReceipt = sinon.stub().resolves(null);
    rskNodeService.web3 = {
      eth: {getTransaction, getTransactionReceipt},
    } as unknown as typeof rskNodeService.web3;
  });

  after(async () => {
    sinon.restore();
    await app.stop();
  });

  it('answers the pegout route within the deadline instead of hanging', async () => {
    const startedAt = Date.now();

    const res = await fetch(`${baseUrl}/tx-status-by-type/${TX_HASH}/PEGOUT`, {
      // Well under MAX_REQUEST_DURATION_MS: if this needs the deadline at all,
      // the root-cause fix has regressed.
      signal: AbortSignal.timeout(10000),
    });
    const elapsed = Date.now() - startedAt;

    // Any bounded answer is a pass here — the defect was that there was none.
    expect(res.status).to.be.a.Number();
    expect(elapsed).to.be.lessThan(10000);
    expect(getTransactionReceipt.called).to.be.true();
  }).timeout(30000);

  it('reached the receipt call, so the regression path was exercised', async () => {
    // Without this the test could pass while never touching the code under test,
    // which is how the earlier version of it misled me.
    expect(getTransaction.called).to.be.true();
    expect(getTransactionReceipt.called).to.be.true();
  }).timeout(30000);

  it('keeps serving afterwards', async () => {
    const res = await fetch(`${baseUrl}/api`);

    expect(res.status).to.equal(200);
  }).timeout(30000);
});
