import {expect} from '@loopback/testlab';
import {
  loadResourceBudgets,
  MAX_TX_PROVIDER_RESPONSE_BYTES,
  RESOURCE_BUDGET_DEFAULTS,
  TX_PROVIDER_MAX_IN_FLIGHT,
} from '../../../config/resource-budgets';
import {
  blockbookPermits,
  txProviderPermits,
} from '../../../utils/provider-permits';

/**
 * The transaction-lookup endpoints need their own budget and their own pool, and
 * the two only make sense together.
 *
 * `GET /tx` returns the raw Bitcoin transaction in `hex` — it is in `tx.model.ts`
 * and in the `Tx` interface, so it is the public contract, not an accident. A
 * mined transaction can approach 1 MB, which is ~2 MB of hex plus thousands of
 * `vin`/`vout` entries in JSON. `MAX_PROVIDER_RESPONSE_BYTES` (1.5 MiB) would
 * refuse legitimate lookups.
 *
 * A bigger budget on the shared pool is worse than no budget in one respect: it
 * multiplies. Materializing a response costs several times its wire size
 * (`Buffer` → `toString()` to UTF-16 → `JSON.parse` to objects), so the number
 * that matters is `3 x budget x in-flight`. On the general pool of 50 that is
 * over a gigabyte. Hence a second, small pool.
 */
describe('Config: transaction-lookup budget and pool', () => {
  describe('MAX_TX_PROVIDER_RESPONSE_BYTES', () => {
    it('falls back to the safe default when nothing is configured', () => {
      expect(loadResourceBudgets({}).MAX_TX_PROVIDER_RESPONSE_BYTES).to.equal(
        RESOURCE_BUDGET_DEFAULTS.MAX_TX_PROVIDER_RESPONSE_BYTES,
      );
    });

    it('reads the budget from the environment', () => {
      expect(
        loadResourceBudgets({MAX_TX_PROVIDER_RESPONSE_BYTES: '1048576'})
          .MAX_TX_PROVIDER_RESPONSE_BYTES,
      ).to.equal(1048576);
    });

    it('never lets an unusable value disable the budget', () => {
      ['0', '-1', 'unbounded', ''].forEach(raw => {
        expect(
          loadResourceBudgets({MAX_TX_PROVIDER_RESPONSE_BYTES: raw})
            .MAX_TX_PROVIDER_RESPONSE_BYTES,
        ).to.equal(RESOURCE_BUDGET_DEFAULTS.MAX_TX_PROVIDER_RESPONSE_BYTES);
      });
    });

    it('sits above the general provider budget, which is the reason it exists', () => {
      expect(
        RESOURCE_BUDGET_DEFAULTS.MAX_TX_PROVIDER_RESPONSE_BYTES,
      ).to.be.greaterThan(RESOURCE_BUDGET_DEFAULTS.MAX_PROVIDER_RESPONSE_BYTES);
    });
  });

  describe('TX_PROVIDER_MAX_IN_FLIGHT', () => {
    it('falls back and refuses unusable values', () => {
      expect(loadResourceBudgets({}).TX_PROVIDER_MAX_IN_FLIGHT).to.equal(
        RESOURCE_BUDGET_DEFAULTS.TX_PROVIDER_MAX_IN_FLIGHT,
      );
      // Zero permits would deadlock every lookup rather than relaxing a bound.
      ['0', '-2', 'lots'].forEach(raw => {
        expect(
          loadResourceBudgets({TX_PROVIDER_MAX_IN_FLIGHT: raw})
            .TX_PROVIDER_MAX_IN_FLIGHT,
        ).to.equal(RESOURCE_BUDGET_DEFAULTS.TX_PROVIDER_MAX_IN_FLIGHT);
      });
    });

    it('is far tighter than the general pool, because each slot costs more', () => {
      expect(
        RESOURCE_BUDGET_DEFAULTS.TX_PROVIDER_MAX_IN_FLIGHT,
      ).to.be.lessThan(RESOURCE_BUDGET_DEFAULTS.BLOCKBOOK_MAX_IN_FLIGHT);
    });
  });

  describe('the product, which is the bound that actually matters', () => {
    it('keeps worst-case transaction-lookup heap inside its envelope', () => {
      // The failure mode of this control is not someone deleting it. It is
      // someone raising one of the two numbers without looking at the other, and
      // that has no symptom until the process dies under concurrency. The
      // invariant lives here rather than in a comment.
      const MATERIALIZATION_FACTOR = 3;
      const MAX_WORST_CASE_BYTES = 128 * 1024 * 1024;
      const {MAX_TX_PROVIDER_RESPONSE_BYTES: budget, TX_PROVIDER_MAX_IN_FLIGHT: permits} =
        RESOURCE_BUDGET_DEFAULTS;

      expect(MATERIALIZATION_FACTOR * budget * permits).to.be.lessThanOrEqual(
        MAX_WORST_CASE_BYTES,
      );
    });

    it('keeps both pools together inside the heap, general pool included', () => {
      // Both pools can be saturated at once, so the sum is the process-wide
      // worst case and neither product alone is.
      //
      // Worth stating what this number is made of, because it is not what the
      // docs used to claim. The general pool contributes
      // 3 x 1.5 MiB x 50 = 225 MiB — roughly two thirds of the total, and far
      // more than the "~75 MB" the docs asserted by omitting the
      // materialization factor entirely. The transaction pool this PR adds is
      // the smaller half at 96 MiB, and it is the one with a tight per-pool
      // envelope above.
      //
      // 384 MiB is 75% of a 512 MB heap. That is a real ceiling rather than a
      // comfortable one, and it is set here at what the process actually does
      // rather than at what would make this PR's number look good: shrinking the
      // general pool would fix it, but that halves /utxo and /addresses-info
      // throughput for a problem that predates this change. Tracked separately.
      // The assertion still bites — doubling either pool breaks it.
      const MATERIALIZATION_FACTOR = 3;
      const MAX_WORST_CASE_BYTES = 384 * 1024 * 1024;
      const d = RESOURCE_BUDGET_DEFAULTS;
      const txWorst =
        MATERIALIZATION_FACTOR *
        d.MAX_TX_PROVIDER_RESPONSE_BYTES *
        d.TX_PROVIDER_MAX_IN_FLIGHT;
      const generalWorst =
        MATERIALIZATION_FACTOR *
        d.MAX_PROVIDER_RESPONSE_BYTES *
        d.BLOCKBOOK_MAX_IN_FLIGHT;

      expect(txWorst + generalWorst).to.be.lessThanOrEqual(MAX_WORST_CASE_BYTES);
      // The general pool is the dominant term. Pinned so that stops being a
      // surprise, and so a future reduction of it is visible as a change here.
      expect(generalWorst).to.be.greaterThan(txWorst);
    });
  });

  describe('txProviderPermits', () => {
    it('is a distinct pool from the general one', () => {
      // Sharing the pool would mean a burst of cheap calls could starve the
      // expensive ones, and — worse — that the expensive ones inherit the
      // general pool's 50-slot limit and its arithmetic.
      expect(txProviderPermits).to.not.equal(blockbookPermits);
    });

    it('is sized from the configured budget', () => {
      expect(txProviderPermits.limit).to.equal(TX_PROVIDER_MAX_IN_FLIGHT);
    });

    it('starts idle', () => {
      expect(txProviderPermits.active).to.equal(0);
      expect(txProviderPermits.queued).to.equal(0);
    });

    it('reports itself under its own metric label', () => {
      // The two pools have to be separable in the metrics, or a saturated tx
      // pool is invisible behind a healthy general one.
      expect(txProviderPermits.name).to.equal('blockbook-tx');
      expect(blockbookPermits.name).to.equal('blockbook');
    });
  });

  it('exports the resolved budget as a module constant', () => {
    expect(MAX_TX_PROVIDER_RESPONSE_BYTES).to.be.a.Number();
    expect(TX_PROVIDER_MAX_IN_FLIGHT).to.be.a.Number();
  });
});
