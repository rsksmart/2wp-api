import {spawn} from 'child_process';
import path from 'path';
import {expect} from '@loopback/testlab';

const REPO_ROOT = path.resolve(__dirname, '../../..');

/**
 * Built inside the child, so nothing this size crosses a process boundary or
 * sits in the suite's own heap.
 *
 * `registerFastBridgeBtcTransaction` has four dynamic `bytes` parameters. All
 * four offsets point at the same blob, so the decoder materializes it once per
 * parameter. Every offset is in bounds: nothing about the bytes is malformed,
 * and following them is the whole attack.
 */
const CHILD = `
const path = require('path');
const root = ${JSON.stringify(REPO_ROOT)};
const {ethers} = require(path.join(root, 'node_modules/ethers'));
const Bridge = require(path.join(root, 'node_modules/@rsksmart/rsk-precompiled-abis')).bridge;
const iface = new ethers.Interface(Bridge.abi);
const SELECTOR = iface.getFunction('registerFastBridgeBtcTransaction').selector;

const TARGET_BYTES = Number(process.argv[2]);
const word = n => BigInt(n).toString(16).padStart(64, '0');
const blobBytes = TARGET_BYTES - 9 * 32;
let head = '';
for (let i = 0; i < 8; i += 1) {
  head += word(i === 0 || i === 2 || i === 4 || i === 6 ? 8 * 32 : 0);
}
const payload = SELECTOR + head + word(blobBytes) + 'ab'.repeat(blobBytes);
// Snapshotted after the payload exists and the modules are loaded, so the delta
// below is what the decode step costs and not what the setup cost.
let rssBefore = process.memoryUsage().rss;
const done = outcome => {
  console.log(outcome);
  console.log('RSS_DELTA_MB:' + ((process.memoryUsage().rss - rssBefore) / 1048576).toFixed(1));
};

if (process.argv[1] === 'unguarded') {
  // What the code did before: the calldata reaches the library's decoder with
  // nothing between them.
  const BridgeTransactionParser = require(path.join(root, 'node_modules/@rsksmart/bridge-transaction-parser'));
  const parser = new BridgeTransactionParser(new ethers.JsonRpcProvider('http://127.0.0.1:1'));
  parser.decodeBridgeMethodParameters('registerFastBridgeBtcTransaction', payload);
  done('DECODED');
} else {
  process.env.RSK_NODE_HOST = 'http://127.0.0.1:1';
  const {RskNodeService} = require(path.join(root, 'dist/services/rsk-node.service'));
  const service = new RskNodeService();
  rssBefore = process.memoryUsage().rss;
  service
    .getBridgeTransaction({
      hash: '0x' + 'ab'.repeat(32),
      data: payload,
      receipt: {transactionHash: '0x' + 'ab'.repeat(32), blockNumber: 1n, from: '0x' + '33'.repeat(20), to: Bridge.address, status: 1n, logs: []},
    })
    .then(() => done('DECODED'))
    .catch(err => done('REFUSED:' + String(err.message).slice(0, 120)));
}
`;

interface ChildResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
}

/** Runs the payload in a 256 MB heap and reports how the process ended. */
function runInSmallHeap(
  mode: 'guarded' | 'unguarded',
  targetBytes: number,
): Promise<ChildResult> {
  return new Promise(resolve => {
    const child = spawn(
      process.execPath,
      ['--max-old-space-size=256', '-e', CHILD, mode, String(targetBytes)],
      {cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe']},
    );
    let output = '';
    child.stdout.on('data', d => (output += d));
    child.stderr.on('data', d => (output += d));
    child.on('close', (code, signal) => resolve({code, signal, output}));
  });
}

/**
 * The only direct evidence that this is closed.
 *
 * Every other test here asserts the decoder is not reached. None of them show
 * that reaching it used to kill the process — and a test that never sees the
 * failure it prevents is not evidence, it is a claim. So the control runs too,
 * rather than being described in a comment: if the payload ever stops being
 * lethal, this says so instead of quietly passing.
 *
 * 256 MB rather than the production 512 MB, which moves the threshold from
 * ~1.5 MiB of calldata to ~1.28 MiB. The attack is unchanged; it just fits in a
 * CI box and a couple of seconds.
 */
describe('Bridge calldata OOM (Acceptance)', () => {
  // Comfortably past the ~1.28 MiB threshold measured at this heap size, so the
  // control does not sit on the edge of V8's behaviour.
  const LETHAL_BYTES = 1536 * 1024;

  it('control: the unguarded decode aborts the process', async () => {
    const {code, signal, output} = await runInSmallHeap('unguarded', LETHAL_BYTES);

    // SIGABRT: V8's fatal handler, not a catchable error — nothing in process
    // could have turned this into a response. A shell reports it as 134; Node
    // reports it here as a signal with a null code, and which of the two arrives
    // depends on the platform, so both spellings count.
    expect(signal === 'SIGABRT' || code === 134).to.be.true();
    expect(output).to.match(/JavaScript heap out of memory/);
    expect(output).to.not.match(/DECODED/);
  }).timeout(60000);

  it('the guarded decode refuses the same payload and stays alive', async () => {
    const {code, signal, output} = await runInSmallHeap('guarded', LETHAL_BYTES);

    expect(output).to.match(/REFUSED:/);
    expect(output).to.match(/bridge_calldata_bytes/);
    expect(output).to.not.match(/JavaScript heap out of memory/);
    expect(code).to.equal(0);
    expect(signal).to.be.null();
  }).timeout(60000);

  it('leaves resident memory flat, because nothing was materialized', async () => {
    const {output} = await runInSmallHeap('guarded', LETHAL_BYTES);
    const delta = Number(/RSS_DELTA_MB:(-?[\d.]+)/.exec(output)?.[1]);

    // Measured across the guarded call alone — the payload and the module graph
    // are already resident when the snapshot is taken. What must not appear is
    // the ~330 MB the decoder would have made of the same bytes.
    expect(delta).to.be.a.Number();
    expect(delta).to.be.lessThan(16);
  }).timeout(60000);

  it('refuses without echoing the payload', async () => {
    const {output} = await runInSmallHeap('guarded', LETHAL_BYTES);

    expect(output).to.not.match(/abababab/);
  }).timeout(60000);
});
