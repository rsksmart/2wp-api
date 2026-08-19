import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {
  MAX_UTXOS_PER_ADDRESS,
  PROVIDER_CONCURRENCY,
  UTXO_RESPONSE_MAX_ROWS,
} from '../../config/resource-budgets';
import {UtxoController} from '../../controllers/utxo.controller';
import {AddressList} from '../../models';
import {UtxoProvider} from '../../services';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../utils/resource-budget';

/** Deterministic unique valid mainnet legacy addresses: '1' + 33 base58 chars. */
function uniqueLegacyMainnet(index: number): string {
  const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = index + 1;
  let suffix = '';
  while (suffix.length < 33) {
    suffix = base58[n % base58.length] + suffix;
    n = Math.floor(n / base58.length) + 1;
  }
  return `1${suffix}`;
}

const givenRows = (count: number) =>
  Array.from({length: count}, (_, i) => ({
    txid: String(i).padStart(64, '0'),
    vout: i,
    amount: '0.00000546',
    satoshis: 546,
    height: 1,
    confirmations: 1,
  }));

describe('UtxoController: resource budgets', () => {
  let utxoProvider: sinon.SinonStub;
  let controller: UtxoController;

  beforeEach(() => {
    resetMetricCounters();
    const service: UtxoProvider = {utxoProvider: sinon.stub()};
    utxoProvider = service.utxoProvider as sinon.SinonStub;
    controller = new UtxoController(service);
  });

  describe('aggregated row budget', () => {
    it('returns a response holding exactly UTXO_RESPONSE_MAX_ROWS rows', async () => {
      // Two addresses that between them land exactly on the budget.
      const perAddress = Math.floor(UTXO_RESPONSE_MAX_ROWS / 2);
      const remainder = UTXO_RESPONSE_MAX_ROWS - perAddress;
      const addresses = [uniqueLegacyMainnet(0), uniqueLegacyMainnet(1)];
      utxoProvider.withArgs(addresses[0]).resolves(givenRows(perAddress));
      utxoProvider.withArgs(addresses[1]).resolves(givenRows(remainder));

      const response = await controller.getUtxos(
        new AddressList({addressList: addresses}),
      );

      expect(response.data).to.have.length(UTXO_RESPONSE_MAX_ROWS);
    });

    it('rejects one row over UTXO_RESPONSE_MAX_ROWS with a 413', async () => {
      const perAddress = Math.floor(UTXO_RESPONSE_MAX_ROWS / 2);
      const remainder = UTXO_RESPONSE_MAX_ROWS - perAddress + 1;
      const addresses = [uniqueLegacyMainnet(0), uniqueLegacyMainnet(1)];
      utxoProvider.withArgs(addresses[0]).resolves(givenRows(perAddress));
      utxoProvider.withArgs(addresses[1]).resolves(givenRows(remainder));

      let caught: any = null;
      try {
        await controller.getUtxos(new AddressList({addressList: addresses}));
      } catch (err) {
        caught = err;
      }

      expect(caught).to.not.be.null();
      expect(caught.statusCode).to.equal(413);
      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.UTXO_RESPONSE_ROWS,
        }),
      ).to.equal(1);
    });

    it('stops calling the provider as soon as the row budget is spent', async () => {
      // Enough addresses to need several batches; each batch alone blows the
      // budget, so only the first batch may ever reach the provider.
      const addressCount = PROVIDER_CONCURRENCY * 3;
      const addresses = Array.from({length: addressCount}, (_, i) =>
        uniqueLegacyMainnet(i),
      );
      utxoProvider.resolves(givenRows(UTXO_RESPONSE_MAX_ROWS));

      await expect(
        controller.getUtxos(new AddressList({addressList: addresses})),
      ).to.be.rejected();

      // Only the first batch was dispatched — the post-allocation flatten that
      // used to happen would have fetched all of them.
      expect(utxoProvider.callCount).to.equal(PROVIDER_CONCURRENCY);
    });
  });

  describe('per-address row budget', () => {
    it('accepts a page exactly at MAX_UTXOS_PER_ADDRESS when the total fits', async () => {
      const address = uniqueLegacyMainnet(0);
      const rows = Math.min(MAX_UTXOS_PER_ADDRESS, UTXO_RESPONSE_MAX_ROWS);
      utxoProvider.resolves(givenRows(rows));

      const response = await controller.getUtxos(
        new AddressList({addressList: [address]}),
      );

      expect(response.data).to.have.length(rows);
    });

    it('rejects a provider page one row over MAX_UTXOS_PER_ADDRESS with a 413', async () => {
      utxoProvider.resolves(givenRows(MAX_UTXOS_PER_ADDRESS + 1));

      let caught: any = null;
      try {
        await controller.getUtxos(
          new AddressList({addressList: [uniqueLegacyMainnet(0)]}),
        );
      } catch (err) {
        caught = err;
      }

      expect(caught).to.not.be.null();
      expect(caught.statusCode).to.equal(413);
      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.UTXOS_PER_ADDRESS,
        }),
      ).to.equal(1);
    });
  });
});
