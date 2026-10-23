import {BridgeService} from "../services"
import {getRequestStore} from "./trace-context";

const bridgeService = new BridgeService();

/**
 * Reads the historical federation addresses from the environment.
 *
 * This used to be `raw?.split(" ")` spread straight into an array, under a
 * `@ts-ignore` that silenced the compiler error naming the problem: with the
 * variable unset the split yields `undefined` and the spread throws
 * `TypeError: undefined is not iterable`. It never fired in development because
 * the variable is in `.env` — but the acceptance harness does not load `.env`,
 * and nothing guarantees a deployed container has it. Without it, the first
 * output of every pegin lookup threw and `/tx-status` stopped resolving pegins.
 *
 * Empty entries are dropped rather than kept, so ragged spacing cannot put an
 * empty string into the address set and make `isAFedAddress('')` true.
 *
 * @param raw - The raw `FEDERATION_ADDRESSES_HISTORY` value, if any.
 * @returns The configured historical addresses, possibly none.
 */
const parseHistory = (raw: string | undefined): string[] =>
  (raw ?? '')
    .split(' ')
    .map(address => address.trim())
    .filter(address => address.length > 0);

/** Asks the Bridge for the current federation address and adds the history to it. */
const resolveFederationAddresses = async (): Promise<ReadonlySet<string>> => {
  const actualFedAddress = await bridgeService.getFederationAddress();
  return new Set([
    ...parseHistory(process.env.FEDERATION_ADDRESSES_HISTORY),
    actualFedAddress,
  ]);
};

/**
 * Every address that counts as the federation, resolved once per request.
 *
 * Resolving the current address is an `eth_call` to the RSK node, and the caller
 * asks once per output of a Bitcoin transaction whose txid a client chose. With
 * nothing memoizing it, a transaction with thousands of outputs turned one
 * unauthenticated HTTP request into thousands of calls upstream.
 *
 * **The memo is scoped to the request, deliberately, and not to the process.**
 * Request scope collapses N calls to 1, which is the entire amplification — after
 * it, 90 requests make 90 calls, exactly what honest traffic makes. A process
 * cache with a TTL would reduce that further, but it would buy a staleness
 * question that does not exist today: during a federation change, a pegin sent to
 * the new federation would be misclassified until the entry expired. Every
 * request here sees one coherent federation state, the one current when it
 * started. If the volume of legitimate calls ever becomes a problem, a short TTL
 * on top of this is additive and can be argued separately.
 *
 * The promise is memoized rather than the resolved value, so two lookups that
 * start concurrently within a request share the call in flight.
 *
 * A **failure** is memoized too, and that is the same decision rather than a
 * different one: the rest of the request reuses the rejection instead of retrying
 * thousands of times against a node that has already refused. Because the memo
 * dies with the request, the next request retries — which is why memoizing the
 * failure here is right where memoizing a failed connection in a process-scoped
 * cache would be wrong. The scope is what makes the two opposite choices both
 * correct.
 *
 * With no request behind the work — the daemon's block sync, or a direct caller —
 * nothing is memoized and the behaviour is exactly what it was. Falling back to a
 * module-scope memo would be a process cache by accident.
 *
 * @returns The federation addresses, current and historical.
 */
export const allFederationAddresses = (): Promise<ReadonlySet<string>> => {
  const store = getRequestStore();
  if (!store) {
    return resolveFederationAddresses();
  }
  store.federationAddresses ??= resolveFederationAddresses();
  return store.federationAddresses;
};

/**
 * Is this address the federation's, now or historically?
 *
 * A `Set` rather than the array this used to build: `includes` is O(M) per
 * output, `has` is O(1). Minor next to removing the upstream call, and free.
 *
 * @param address - The address to test.
 * @returns Whether it is a federation address.
 */
export const isAFedAddress = async (address: string): Promise<boolean> =>
  (await allFederationAddresses()).has(address);
