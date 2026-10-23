import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {RskNodeService} from '../../../services/rsk-node.service';

/**
 * Offline tests for `getTransaction`. Deliberately *not* modelled on
 * `rsk-node.services.unit.ts`, which makes live RPC calls: the behaviour under
 * test here is how the method settles, which a real node cannot be asked to
 * reproduce on demand.
 */
describe('Service: RskNodeService.getTransaction', () => {
  const TX_HASH = '0x' + 'ab'.repeat(32);
  let service: RskNodeService;
  let getTransaction: sinon.SinonStub;
  let getTransactionReceipt: sinon.SinonStub;
  let previousHost: string | undefined;

  before(() => {
    // The service builds a Web3 client in its constructor, which needs a valid
    // provider URL. Nothing dials it — the transport is replaced below.
    previousHost = process.env.RSK_NODE_HOST;
    process.env.RSK_NODE_HOST = 'http://127.0.0.1:1';
  });

  after(() => {
    process.env.RSK_NODE_HOST = previousHost;
  });

  /** A mined transaction: both blockHash and blockNumber present. */
  const givenMinedTx = () => ({
    hash: TX_HASH,
    blockHash: '0x' + '11'.repeat(32),
    blockNumber: 8_000_000n,
    input: '0x1234',
    to: '0x' + '22'.repeat(20),
    from: '0x' + '33'.repeat(20),
    value: 1000n,
  });

  beforeEach(() => {
    service = new RskNodeService();
    getTransaction = sinon.stub();
    getTransactionReceipt = sinon.stub();
    // The service builds its own Web3 in the constructor, so the transport is
    // replaced rather than injected.
    service.web3 = {
      eth: {getTransaction, getTransactionReceipt},
    } as unknown as typeof service.web3;
  });

  afterEach(() => {
    sinon.restore();
  });

  it('settles when the node answers with no receipt for a mined transaction', async () => {
    // A reorg between the two RPC calls, or a lagging node in a load-balanced
    // fleet, answers the receipt call with null for a transaction that does have
    // a block. Nothing may leave the caller waiting forever.
    getTransaction.resolves(givenMinedTx());
    getTransactionReceipt.resolves(null);

    const tx = await service.getTransaction(TX_HASH, true);

    expect(tx.hash).to.equal(TX_HASH);
    expect(tx.receipt).to.be.undefined();
  });

  it('attaches the receipt when the node returns one', async () => {
    const receipt = {status: 1n, transactionHash: TX_HASH};
    getTransaction.resolves(givenMinedTx());
    getTransactionReceipt.resolves(receipt);

    const tx = await service.getTransaction(TX_HASH, true);

    expect(tx.receipt).to.deepEqual(receipt);
  });

  it('does not ask for a receipt for an unmined transaction', async () => {
    getTransaction.resolves({...givenMinedTx(), blockHash: null, blockNumber: null});

    const tx = await service.getTransaction(TX_HASH, true);

    expect(tx.receipt).to.be.undefined();
    sinon.assert.notCalled(getTransactionReceipt);
  });

  it('resolves without a receipt when none was requested', async () => {
    getTransaction.resolves(givenMinedTx());

    const tx = await service.getTransaction(TX_HASH);

    expect(tx.receipt).to.be.undefined();
    sinon.assert.notCalled(getTransactionReceipt);
  });

  it('rejects when the transaction is unknown to the node', async () => {
    getTransaction.resolves(null);

    await expect(service.getTransaction(TX_HASH, true)).to.be.rejectedWith(
      /not found/i,
    );
  });

  it('rejects when the receipt call itself fails', async () => {
    getTransaction.resolves(givenMinedTx());
    getTransactionReceipt.rejects(new Error('node unavailable'));

    await expect(service.getTransaction(TX_HASH, true)).to.be.rejectedWith(
      /node unavailable/,
    );
  });
});
