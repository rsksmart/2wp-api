import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {MAX_BRIDGE_CALLDATA_BYTES} from '../../../config/resource-budgets';
import {RskTransaction} from '../../../models/rsk/rsk-transaction.model';
import {RskNodeService} from '../../../services/rsk-node.service';
import {BRIDGE_METHODS, getBridgeSignature} from '../../../utils/bridge-utils';

const TX_HASH = `0x${'d2'.repeat(32)}`;
const BRIDGE = '0x0000000000000000000000000000000001000006';
const SENDER_LOWER = '0x4495768e683423a4299d6a7f02a0689a6ff5a0a4';
// The real EIP-55 form of SENDER_LOWER, written out rather than derived: the
// point is to pin the value, and deriving it with the same call the adapter
// makes would assert nothing. Note that the mixed-case literal older fixtures in
// this repo use for this address is not a valid checksum at all.
const SENDER_CHECKSUMMED = '0x4495768E683423a4299d6a7F02a0689a6Ff5a0a4';

/** A pegout method, so these stay green once the selector allowlist lands. */
const RELEASE_BTC = getBridgeSignature(BRIDGE_METHODS.RELEASE_BTC);

const givenRskTransaction = (over: Partial<RskTransaction> = {}): RskTransaction =>
  ({
    hash: TX_HASH,
    blockHash: `0x${'11'.repeat(32)}`,
    blockHeight: 8_000_000,
    createdOn: new Date(0),
    data: RELEASE_BTC,
    to: BRIDGE,
    value: 0,
    from: SENDER_CHECKSUMMED,
    receipt: {
      // web3's shape, which is what this service actually holds.
      transactionHash: TX_HASH,
      blockNumber: 8_000_000n,
      from: SENDER_LOWER,
      to: BRIDGE,
      status: 1n,
      logs: [],
    },
    ...over,
  } as unknown as RskTransaction);

/**
 * The structural half of the 84419 fix.
 *
 * `getBridgeTransactionByTxHash` takes a hash and re-fetches the transaction
 * itself, so a guard on the `RskTransaction` this service already holds
 * constrains nothing it decodes — it is advice, not a control. Handing the
 * parser the transaction we validated is what makes the calldata bound real,
 * and it drops two duplicate RPC round trips per request as a side effect.
 */
describe('Service: RskNodeService.getBridgeTransaction', () => {
  let service: RskNodeService;
  let decodeBridgeTransaction: sinon.SinonStub;
  let getBridgeTransactionByTxHash: sinon.SinonStub;
  let ethersGetTransaction: sinon.SinonStub;
  let web3GetTransaction: sinon.SinonStub;

  beforeEach(() => {
    service = new RskNodeService();
    decodeBridgeTransaction = sinon.stub().resolves({txHash: TX_HASH, events: []});
    getBridgeTransactionByTxHash = sinon.stub();
    service.bridgeTransactionParser = {
      decodeBridgeTransaction,
      getBridgeTransactionByTxHash,
    } as never;

    ethersGetTransaction = sinon.stub();
    service.ethersProvider = {
      getTransaction: ethersGetTransaction,
      getTransactionReceipt: sinon.stub(),
    } as never;
    web3GetTransaction = sinon.stub();
    service.web3 = {
      eth: {getTransaction: web3GetTransaction, getTransactionReceipt: sinon.stub()},
    } as never;
  });

  it('refuses oversized calldata before the parser is reached', async () => {
    const tx = givenRskTransaction({
      data: `0x${'ab'.repeat(MAX_BRIDGE_CALLDATA_BYTES + 1)}`,
    });

    await expect(service.getBridgeTransaction(tx)).to.be.rejectedWith(
      /bridge_calldata_bytes/,
    );
    sinon.assert.notCalled(decodeBridgeTransaction);
    // The one that matters: the unguarded entry point is never reached, so
    // there is no second copy of the calldata for it to decode.
    sinon.assert.notCalled(getBridgeTransactionByTxHash);
  });

  it('refuses malformed calldata the same way', async () => {
    const tx = givenRskTransaction({data: '0xzz' as never});

    await expect(service.getBridgeTransaction(tx)).to.be.rejectedWith(
      /bridge_calldata_bytes/,
    );
    sinon.assert.notCalled(decodeBridgeTransaction);
  });

  it('never asks the node for the transaction again', async () => {
    // The re-fetch is exactly what made a call-site guard bypassable. If this
    // starts happening again the bound stops being a control, silently.
    await service.getBridgeTransaction(givenRskTransaction());

    sinon.assert.notCalled(ethersGetTransaction);
    sinon.assert.notCalled(web3GetTransaction);
    sinon.assert.notCalled(getBridgeTransactionByTxHash);
    sinon.assert.calledOnce(decodeBridgeTransaction);
  });

  it('returns undefined for a transaction with no receipt', async () => {
    const result = await service.getBridgeTransaction(
      givenRskTransaction({receipt: null}),
    );

    expect(result).to.be.undefined();
    sinon.assert.notCalled(decodeBridgeTransaction);
  });

  it('hands the parser the ethers shapes it requires', async () => {
    await service.getBridgeTransaction(givenRskTransaction());

    const [tx, receipt] = decodeBridgeTransaction.firstCall.args;
    // `decodeBridgeTransaction` compares `tx.hash` to `receipt.hash`; web3 calls
    // it `transactionHash`, so without this every real pegout becomes an error.
    expect(tx.hash).to.equal(TX_HASH);
    expect(receipt.hash).to.equal(TX_HASH);
    expect(tx.data).to.equal(RELEASE_BTC);
    expect(receipt.to).to.equal(BRIDGE);
    // `getBlock(receipt.blockNumber)` is called with this; web3 hands back a
    // bigint.
    expect(receipt.blockNumber).to.equal(8_000_000);
    expect(typeof receipt.blockNumber).to.equal('number');
    // `sender` on the decoded Transaction is this value verbatim, and ethers
    // checksums it. Forwarding web3's lowercase form would quietly change the
    // `rskSenderAddress` this API returns.
    expect(receipt.from).to.equal(SENDER_CHECKSUMMED);
    expect(receipt.logs).to.be.an.Array();
  });

  it('leaves an unreadable sender alone rather than throwing on it', async () => {
    // Checksumming is a normalization, not a validation: a sender the node
    // reports in some shape ethers will not parse must not cost a legitimate
    // pegout its decode.
    await service.getBridgeTransaction(
      givenRskTransaction({
        receipt: {
          transactionHash: TX_HASH,
          blockNumber: 8_000_000n,
          from: 'not-an-address',
          to: BRIDGE,
          status: 1n,
          logs: [],
        } as never,
      }),
    );

    expect(decodeBridgeTransaction.firstCall.args[1].from).to.equal(
      'not-an-address',
    );
  });
});
