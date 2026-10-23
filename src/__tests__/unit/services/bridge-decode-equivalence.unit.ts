import BridgeTransactionParser, {
  Transaction,
} from '@rsksmart/bridge-transaction-parser';
import {expect} from '@loopback/testlab';
import {ethers} from 'ethers';
import Web3 from 'web3';
import {
  installRskRpcMock,
  restoreRskRpcMock,
  RSK_RPC_HOST,
} from '../../fixtures/rsk-rpc.mock';

/**
 * A real `registerBtcTransaction` recorded from testnet: 708 bytes of calldata,
 * one `pegin_btc` log, `status: 0x1`. See `fixtures/README.md`.
 */
const TX = '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';

/**
 * Characterizes the decode path *before* it is replaced.
 *
 * `getBridgeTransactionByTxHash` takes only a hash and re-fetches the
 * transaction itself, so nothing a caller checks about the transaction it
 * already holds constrains what that method decodes. Replacing it with
 * `decodeBridgeTransaction`, which is handed the transaction we validated, is
 * what turns the calldata bound into a control rather than advice.
 *
 * The risk in that swap is not the bound, it is that `decodeBridgeTransaction`
 * requires invariants the old path satisfied by accident. These tests pin them,
 * so the replacement is checked against recorded reality rather than against a
 * reading of the library.
 */
describe('Service: bridge decode path characterization', () => {
  before(() => {
    installRskRpcMock();
  });

  after(() => {
    restoreRskRpcMock();
  });

  let provider: ethers.JsonRpcProvider;
  let parser: BridgeTransactionParser;

  beforeEach(() => {
    provider = new ethers.JsonRpcProvider(RSK_RPC_HOST);
    parser = new BridgeTransactionParser(provider);
  });

  it('decodes the same Transaction by hash and from an already-fetched tx', async () => {
    const viaHash: Transaction | undefined =
      await parser.getBridgeTransactionByTxHash(TX);
    const tx = await provider.getTransaction(TX);
    const receipt = await provider.getTransactionReceipt(TX);

    const viaDecode = await parser.decodeBridgeTransaction(tx!, receipt!);

    expect(viaHash).to.not.be.undefined();
    // Structural equality, not identity: the two paths build separate objects
    // from the same bytes, and it is the bytes that have to match.
    expect(JSON.parse(JSON.stringify(viaDecode))).to.deepEqual(
      JSON.parse(JSON.stringify(viaHash)),
    );
  });

  it('pins the fields the decode consumes, so a shape change is visible', async () => {
    const receipt = await provider.getTransactionReceipt(TX);

    // `createBridgeTx` reads exactly these. Anything we hand it has to carry
    // them, in these shapes.
    expect(receipt!.hash).to.equal(TX);
    expect(receipt!.to).to.equal('0x0000000000000000000000000000000001000006');
    expect(receipt!.from).to.be.a.String();
    expect(receipt!.blockNumber).to.be.a.Number();
    expect(receipt!.logs).to.be.an.Array();
  });

  it('rejects a web3-shaped receipt, which is what this service actually holds', async () => {
    // The specification for the adapter. `RskTransaction.receipt` comes from
    // `web3.eth.getTransactionReceipt`, which names the hash `transactionHash`
    // and returns `blockNumber` as a bigint — so the parser's first guard fires
    // on `undefined !== <hash>` before any decoding happens. Handing the raw
    // web3 receipt straight to `decodeBridgeTransaction` would turn every real
    // pegout into an error, which is exactly the silent regression the
    // structural change risks.
    const web3 = new Web3(RSK_RPC_HOST);
    const web3Receipt = await web3.eth.getTransactionReceipt(TX);
    const tx = await provider.getTransaction(TX);

    expect(web3Receipt.transactionHash).to.not.be.undefined();
    expect(
      (web3Receipt as unknown as {hash?: string}).hash,
    ).to.be.undefined();
    expect(typeof web3Receipt.blockNumber).to.equal('bigint');

    await expect(
      parser.decodeBridgeTransaction(tx!, web3Receipt as never),
    ).to.be.rejectedWith(/should belong to the same transaction/);
  });

  it('checksums the sender, which a web3 receipt does not', async () => {
    // `sender` on the decoded Transaction is `receipt.from` verbatim. ethers
    // checksums it, web3 does not, so an adapter that forwards web3's value
    // would silently change the `rskSenderAddress` this API returns.
    const web3 = new Web3(RSK_RPC_HOST);
    const web3Receipt = await web3.eth.getTransactionReceipt(TX);
    const receipt = await provider.getTransactionReceipt(TX);

    expect(receipt!.from).to.not.equal(String(web3Receipt.from));
    expect(ethers.getAddress(String(web3Receipt.from))).to.equal(receipt!.from);
  });
});
