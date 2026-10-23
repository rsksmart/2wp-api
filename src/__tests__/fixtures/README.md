# Recorded RSK JSON-RPC fixtures

`rsk-rpc.fixture.json` holds **real** responses captured from
`public-node.testnet.rsk.co`. `rsk-rpc.mock.ts` replays them, so
`bridge.handler.unit.ts` and `rsk-node.services.unit.ts` run without a network.

## Why

Both suites used to call the live node. That made `npm test` depend on the health
of a public endpoint and on the developer's VPN state — a transient
`read EINVAL` failed the build with nothing wrong in the code. Because the
fixtures are captures rather than hand-written shapes, the assertions still check
the parser against genuine Bridge data; only the source of the bytes changed.

## Refreshing

With the network up, from the repo root:

```bash
npm run build
node src/__tests__/fixtures/record-rsk-rpc.js
```

Entries are keyed by RPC method plus params, so every `eth_call` selector is a
separate entry and replay is exact.

**Read a mismatch before overwriting it.** A fixture that no longer matches the
node means the ABI, the chain state, or the node's behaviour moved — which is
information. Re-recording without looking discards it.

## When a test says `No recorded RPC response for …`

The code under test started making a call nobody recorded. That is intentional
and loud: add the call to the recorder's operation list and re-record, rather
than loosening the mock to answer anything.
