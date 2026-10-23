/**
 * Records real JSON-RPC exchanges for `rsk-rpc.fixture.json`.
 *
 * Run from the repo root with the network up, after `npm run build`:
 *
 *     node src/__tests__/fixtures/record-rsk-rpc.js
 *
 * It exercises exactly the calls `bridge.handler.unit.ts` and
 * `rsk-node.services.unit.ts` make, and writes every distinct request keyed by
 * method plus params — so each `eth_call` selector gets its own entry.
 *
 * Deliberately a plain script rather than a test: re-recording is an act with a
 * decision attached. If a fixture stops matching what the node returns, that is
 * a signal about the ABI or the node, and it should be read before it is
 * overwritten.
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const R = path.resolve(__dirname, '../../..');
const HOST = 'https://public-node.testnet.rsk.co';
process.env.RSK_NODE_HOST = HOST;

const nock = require(R + '/node_modules/nock');
nock.recorder.rec({output_objects: true, dont_print: true, enable_reqheaders_recording: false});

const {BridgeService} = require(R + '/dist/services');
const {RskNodeService} = require(R + '/dist/services/rsk-node.service');
const BridgeTransactionParser = require(R + '/node_modules/@rsksmart/bridge-transaction-parser');
const {ethers} = require(R + '/node_modules/ethers');

const RSK_TX = '0xd2852f38fedf1915978715b8a0dc0670040ac4e9065989c810a5bf29c1e006fb';
const SIMPLE_TX = '0x368cfbff365655d14eeaaba822c20fa8bb0c98fda0eef938094dee4ec7a83a66';
const BTC_VALID = '7006c53b81e644367bf736e07456af8a1ce487174fc6b5e398f6fa7b8d069daa';
const BTC_INVALID = '1234c53b81e644367bf736e07456af8a1ce487174fc6b5e398f6fa7b8d069daa';
const INITIAL_HEIGHT = 2863627;

(async () => {
  const bridge = new BridgeService();
  const ops = [
    ['getFederationAddress', () => bridge.getFederationAddress()],
    ['getMinPeginValue', () => bridge.getMinPeginValue()],
    ['getLockingCapAmount', () => bridge.getLockingCapAmount()],
    ['isBtcTxHashAlreadyProcessed(valid)', () => bridge.isBtcTxHashAlreadyProcessed(BTC_VALID)],
    ['isBtcTxHashAlreadyProcessed(invalid)', () => bridge.isBtcTxHashAlreadyProcessed(BTC_INVALID)],
    ['getRbtcInCirculation', () => bridge.getRbtcInCirculation()],
    ['getPeginAvailability', () => bridge.getPeginAvailability()],
    ['parser.getBridgeTransactionByTxHash', () =>
      new BridgeTransactionParser(new ethers.JsonRpcProvider(HOST))
        .getBridgeTransactionByTxHash(RSK_TX)],
  ];
  const node = new RskNodeService();
  ops.push(
    ['node.getBlock', () => node.getBlock(INITIAL_HEIGHT)],
    ['node.getTransactionReceipt', () => node.getTransactionReceipt(SIMPLE_TX)],
    ['node.getTransaction(true)', () => node.getTransaction(SIMPLE_TX, true)],
    ['node.getTransaction(false)', () => node.getTransaction(SIMPLE_TX, false)],
    ['node.getBlockNumber', () => node.getBlockNumber()],
    ['node.getBridgeTransaction', () => node.getBridgeTransaction(SIMPLE_TX)],
  );

  for (const [name, run] of ops) {
    try { await run(); process.stdout.write(`  ok   ${name}\n`); }
    catch (e) { process.stdout.write(`  FAIL ${name}: ${(e.shortMessage||e.message||'').slice(0,70)}\n`); }
  }

  /**
   * nock records a reply as JSON, a hex string, or an array of hex chunks —
   * gzipped when the server compressed it. Normalise all of those to JSON.
   */
  const decodeResponse = raw => {
    const joined =
      Array.isArray(raw) && raw.every(x => typeof x === 'string')
        ? raw.join('')
        : raw;
    if (typeof joined !== 'string') {
      return joined;
    }
    const buf = Buffer.from(joined, 'hex');
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      return JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
    }
    return JSON.parse(joined);
  };

  const recorded = {};
  for (const call of nock.recorder.play()) {
    const decoded = decodeResponse(call.response);
    const reqs = Array.isArray(call.body) ? call.body : [call.body];
    const ress = Array.isArray(decoded) ? decoded : [decoded];
    reqs.forEach(rq => {
      if (!rq || !rq.method) return;
      const match = ress.find(rs => rs && rs.id === rq.id) ?? ress[0];
      if (!match) return;
      const key = `${rq.method}:${JSON.stringify(rq.params ?? [])}`;
      if (!(key in recorded)) {
        recorded[key] = 'error' in match ? {error: match.error} : {result: match.result};
      }
    });
  }
  fs.writeFileSync(R + '/src/__tests__/fixtures/rsk-rpc.fixture.json',
                   JSON.stringify(recorded, null, 2) + '\n');
  console.log(`\nrecorded ${Object.keys(recorded).length} distinct RPC calls`);
  console.log(Object.keys(recorded).map(k => '  ' + k.slice(0, 96)).join('\n'));
  process.exit(0);
})();
