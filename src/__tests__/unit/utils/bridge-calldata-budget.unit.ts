import {expect} from '@loopback/testlab';
import {MAX_BRIDGE_CALLDATA_BYTES} from '../../../config/resource-budgets';
import {assertBridgeCalldataWithinBudget} from '../../../utils/bridge-utils';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

/** Well-formed hex of exactly `bytes` bytes. */
const hexOf = (bytes: number) => `0x${'ab'.repeat(bytes)}`;

/**
 * The size bound on anything handed to the Bridge ABI decoder.
 *
 * The decoder amplifies calldata into heap by roughly 225x, and the four
 * dynamic `bytes` parameters of a Bridge method may all point at the same blob,
 * so ~1.5 MiB of calldata is enough to abort the process. This is the control
 * that keeps that arithmetic bounded; everything below is about it counting the
 * right thing and never echoing what it refused.
 */
describe('Utils: bridge calldata budget', () => {
  beforeEach(resetMetricCounters);

  it('accepts calldata at exactly the limit', () => {
    expect(() =>
      assertBridgeCalldataWithinBudget(hexOf(MAX_BRIDGE_CALLDATA_BYTES)),
    ).to.not.throw();
  });

  it('rejects the limit plus one byte with a bounded 413', () => {
    let caught: any = null;
    try {
      assertBridgeCalldataWithinBudget(hexOf(MAX_BRIDGE_CALLDATA_BYTES + 1));
    } catch (err) {
      caught = err;
    }

    expect(caught).to.not.be.null();
    expect(caught.statusCode).to.equal(413);
    expect(caught.message).to.match(/bridge_calldata_bytes/);
    // The calldata is never reflected to the client — that is what keeps an
    // oversized request from becoming an oversized response.
    expect(caught.message).to.not.match(/abab/);
    expect(caught.message.length).to.be.below(200);
  });

  it('counts bytes, not hex characters', () => {
    // '0x' plus 200 characters is 100 bytes. A limit of 100 has to accept it;
    // counting characters would reject it, and counting `length` would reject
    // legitimate pegouts at half the intended size.
    expect(() =>
      assertBridgeCalldataWithinBudget(hexOf(100), {limit: 100}),
    ).to.not.throw();
    expect(() =>
      assertBridgeCalldataWithinBudget(hexOf(101), {limit: 100}),
    ).to.throw(/bridge_calldata_bytes/);
  });

  it('accepts empty calldata, which is how a pegout is requested', () => {
    // Sending value to the Bridge with no calldata is the ordinary pegout
    // request. A bound that refused it would break the main route.
    expect(() => assertBridgeCalldataWithinBudget('0x')).to.not.throw();
  });

  it('fails closed on malformed calldata', () => {
    const malformed = ['0xabc', '0xzz', 'sin-prefijo', '', undefined, null, 42, {}];

    malformed.forEach(bad => {
      expect(() => assertBridgeCalldataWithinBudget(bad as never)).to.throw(
        /bridge_calldata_bytes/,
      );
    });
  });

  it('emits the observability signal on a violation, with no payload in it', () => {
    try {
      assertBridgeCalldataWithinBudget(hexOf(MAX_BRIDGE_CALLDATA_BYTES + 1), {
        route: 'GET /tx-status-by-type/{txId}/{txType}',
      });
    } catch {
      // The signal is the assertion, not the throw.
    }

    expect(
      getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
        resource: ResourceBudgetName.BRIDGE_CALLDATA_BYTES,
      }),
    ).to.equal(1);
  });

  it('reports the observed size as a scalar, so it can be alerted on', () => {
    let caught: any = null;
    try {
      assertBridgeCalldataWithinBudget(hexOf(MAX_BRIDGE_CALLDATA_BYTES + 7));
    } catch (err) {
      caught = err;
    }

    expect(caught.message).to.match(
      new RegExp(`observed ${MAX_BRIDGE_CALLDATA_BYTES + 7}\\b`),
    );
    expect(caught.message).to.match(
      new RegExp(`limit ${MAX_BRIDGE_CALLDATA_BYTES}\\b`),
    );
  });

  it('records malformed calldata as an observed size of -1, never as a length', () => {
    // -1 is not a size: it says "this was refused before it was measured". A
    // real length here would be a channel for the payload to reach the logs.
    let caught: any = null;
    try {
      assertBridgeCalldataWithinBudget('0xzz');
    } catch (err) {
      caught = err;
    }

    expect(caught.message).to.match(/observed -1\b/);
    expect(caught.message).to.match(/not well-formed hex/);
  });
});
