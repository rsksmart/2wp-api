import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {BridgeService} from '../../../services';
import {
  allFederationAddresses,
  isAFedAddress,
} from '../../../utils/federation-addresses';
import {runWithTraceId} from '../../../utils/trace-context';

const FED = '2N1GMB8gxHYR5HLPSRgf9CJ9Lunjb9CTnKB';
const OLD_FED = '2N6JWYUb6Li4Kux6UB2eihT7n3rm3YX97uv';

describe('Utils: federation addresses', () => {
  let getFederationAddress: sinon.SinonStub;
  let previousHistory: string | undefined;

  beforeEach(() => {
    previousHistory = process.env.FEDERATION_ADDRESSES_HISTORY;
    // Stubbed on the prototype: the module under test holds a `BridgeService`
    // built at import time, which nothing can reach by injection.
    getFederationAddress = sinon
      .stub(BridgeService.prototype, 'getFederationAddress')
      .resolves(FED);
  });

  afterEach(() => {
    sinon.restore();
    if (previousHistory === undefined) {
      delete process.env.FEDERATION_ADDRESSES_HISTORY;
    } else {
      process.env.FEDERATION_ADDRESSES_HISTORY = previousHistory;
    }
  });

  describe('reading the configured history', () => {
    it('works when FEDERATION_ADDRESSES_HISTORY is not set', async () => {
      // This threw `TypeError: undefined is not iterable`, from spreading an
      // optional-chained `split` result. A `@ts-ignore` sat directly above it,
      // silencing the compiler error that named the problem exactly.
      //
      // It never fired in development because the variable is in `.env`, and it
      // is not a hypothetical: the acceptance harness does not load `.env`, and
      // nothing guarantees the variable is present in a deployed container.
      // Without it, the first output of every pegin lookup throws.
      delete process.env.FEDERATION_ADDRESSES_HISTORY;

      expect([...(await allFederationAddresses())]).to.deepEqual([FED]);
    });

    it('works when the history is empty', async () => {
      process.env.FEDERATION_ADDRESSES_HISTORY = '';

      expect([...(await allFederationAddresses())]).to.deepEqual([FED]);
    });

    it('includes the historical addresses alongside the current one', async () => {
      process.env.FEDERATION_ADDRESSES_HISTORY = OLD_FED;

      const addresses = await allFederationAddresses();

      expect(addresses.has(OLD_FED)).to.be.true();
      expect(addresses.has(FED)).to.be.true();
    });

    it('tolerates ragged separators', async () => {
      process.env.FEDERATION_ADDRESSES_HISTORY = `   ${OLD_FED}    ${FED}  `;

      // Two historical entries, one of which is the current address, so the set
      // collapses them: two distinct addresses in total.
      expect((await allFederationAddresses()).size).to.equal(2);
    });
  });

  describe('memoization is scoped to one request', () => {
    it('resolves once however many times it is asked', async () => {
      await runWithTraceId('t', async () => {
        await allFederationAddresses();
        await allFederationAddresses();
        await allFederationAddresses();
      });

      sinon.assert.calledOnce(getFederationAddress);
    });

    it('shares one call between concurrent lookups', async () => {
      // Memoizing the resolved value instead of the promise would issue two
      // calls here, because neither has resolved when the second one starts.
      await runWithTraceId('t', async () => {
        await Promise.all([
          allFederationAddresses(),
          allFederationAddresses(),
          allFederationAddresses(),
        ]);
      });

      sinon.assert.calledOnce(getFederationAddress);
    });

    it('does not carry across requests', async () => {
      // The half of the contract people forget to test. Without it, nothing
      // distinguishes this from a process-wide cache — and a process-wide cache
      // is a staleness question this deliberately does not open.
      await runWithTraceId('a', () => allFederationAddresses());
      await runWithTraceId('b', () => allFederationAddresses());

      expect(getFederationAddress.callCount).to.equal(2);
    });

    it('does not memoize with no request behind it', async () => {
      // The daemon's block sync, and any direct caller. Falling back to a
      // module-scope memo here would be a process cache by accident.
      await allFederationAddresses();
      await allFederationAddresses();

      expect(getFederationAddress.callCount).to.equal(2);
    });

    it('keeps concurrent requests independent', async () => {
      await Promise.all([
        runWithTraceId('a', async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          await allFederationAddresses();
        }),
        runWithTraceId('b', () => allFederationAddresses()),
      ]);

      expect(getFederationAddress.callCount).to.equal(2);
    });
  });

  describe('a failure is scoped the same way', () => {
    it('reuses a rejection within the request instead of retrying', async () => {
      // With 30 000 outputs, retrying per output would mean 30 000 attempts
      // against a node that has already refused.
      getFederationAddress.rejects(new Error('node down'));

      await runWithTraceId('t', async () => {
        await allFederationAddresses().catch(() => {});
        await allFederationAddresses().catch(() => {});
      });

      sinon.assert.calledOnce(getFederationAddress);
    });

    it('retries on the next request', async () => {
      // The pair above and this one are what define the scope. A memoized
      // failure that outlived the request would turn a transient node blip into
      // a permanent one — the opposite failure from caching too little.
      getFederationAddress.onFirstCall().rejects(new Error('down'));
      getFederationAddress.onSecondCall().resolves(FED);

      await runWithTraceId('a', () => allFederationAddresses()).catch(() => {});
      const addresses = await runWithTraceId('b', () =>
        allFederationAddresses(),
      );

      expect(addresses.has(FED)).to.be.true();
    });
  });

  describe('isAFedAddress', () => {
    it('recognises the current federation address', async () => {
      expect(await isAFedAddress(FED)).to.be.true();
    });

    it('recognises a historical federation address', async () => {
      process.env.FEDERATION_ADDRESSES_HISTORY = OLD_FED;

      expect(await isAFedAddress(OLD_FED)).to.be.true();
    });

    it('rejects an address that is neither', async () => {
      expect(await isAFedAddress('2NotAFederationAddress')).to.be.false();
    });

    it('shares the request memo with its callers', async () => {
      await runWithTraceId('t', async () => {
        await isAFedAddress('a');
        await isAFedAddress('b');
      });

      sinon.assert.calledOnce(getFederationAddress);
    });
  });
});
