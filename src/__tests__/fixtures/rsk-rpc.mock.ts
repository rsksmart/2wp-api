import nock from 'nock';
import fixture from './rsk-rpc.fixture.json';

/**
 * Replays recorded RSK JSON-RPC exchanges, so suites that exercise the Bridge
 * and the node need no network.
 *
 * These suites used to make live calls, which made `npm test` depend on the
 * health of a public node and on the developer's VPN state: a transient
 * `read EINVAL` failed the build with nothing wrong in the code.
 *
 * The responses in `rsk-rpc.fixture.json` are **real**, captured from
 * `public-node.testnet.rsk.co`, so the assertions still check the parser against
 * genuine Bridge data rather than against hand-written shapes. What changed is
 * only where the bytes come from.
 *
 * Refreshing them: run the recorder (see the README in this directory) with the
 * network up. A fixture that no longer matches what the node returns is a real
 * signal — the ABI or the node's behaviour moved — and should be reviewed, not
 * silently re-recorded.
 */
export const RSK_RPC_HOST = 'https://public-node.testnet.rsk.co';

interface RpcEntry {
  result?: unknown;
  error?: unknown;
}

interface RpcRequest {
  id: number | string;
  method: string;
  params?: unknown[];
}

const responses = fixture as Record<string, RpcEntry>;

/** Keyed by method plus params, so each `eth_call` selector is distinct. */
const keyOf = (req: RpcRequest): string =>
  `${req.method}:${JSON.stringify(req.params ?? [])}`;

const answer = (req: RpcRequest) => {
  const entry = responses[keyOf(req)];
  if (!entry) {
    // Loud on purpose. A missing fixture means the code started making a call
    // nobody recorded, which is a change worth seeing rather than a blank.
    return {
      jsonrpc: '2.0',
      id: req.id,
      error: {code: -32601, message: `No recorded RPC response for ${keyOf(req)}`},
    };
  }
  return {jsonrpc: '2.0', id: req.id, ...entry};
};

let previousHost: string | undefined;

/**
 * Installs the replay interceptor and forbids real connections.
 *
 * @returns Nothing; call {@link restoreRskRpcMock} when the suite ends.
 */
export function installRskRpcMock(): void {
  // The services read this at construction, so pinning it keeps the suite
  // independent of whatever the developer has exported.
  previousHost = process.env.RSK_NODE_HOST;
  process.env.RSK_NODE_HOST = RSK_RPC_HOST;

  // nock installs a global http interceptor on import. Other suites in this
  // process may make real calls, so it has to be uninstalled again in
  // `restoreRskRpcMock`.
  if (!nock.isActive()) {
    nock.activate();
  }
  // The strongest statement of hermeticity available: if anything tries to
  // reach the network, it fails rather than quietly succeeding.
  nock.disableNetConnect();

  nock(RSK_RPC_HOST)
    .persist()
    .post(() => true)
    .reply(200, (_uri, body) => {
      const payload = body as RpcRequest | RpcRequest[];
      return Array.isArray(payload) ? payload.map(answer) : answer(payload);
    });
}

/** Removes the interceptor and restores real networking for other suites. */
export function restoreRskRpcMock(): void {
  process.env.RSK_NODE_HOST = previousHost;
  nock.cleanAll();
  nock.enableNetConnect();
  nock.restore();
}
