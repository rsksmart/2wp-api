import {expect} from '@loopback/testlab';
import nock from 'nock';
import {
  MAX_ADDRESS_INFO_TXIDS,
  MAX_UTXOS_PER_ADDRESS,
} from '../../../config/resource-budgets';
import {fetchAddressInfo} from '../../../services/address.service';
import {fetchAddressUtxos} from '../../../services/utxo-provider.service';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

const HOST = 'http://blockbook.test';
const ADDRESS = 'mzBc4XEFSdzCDcTxAgf6EZXgsZWpztRhef';

const givenUtxoRows = (count: number) =>
  Array.from({length: count}, (_, i) => ({
    txid: String(i).padStart(64, '0'),
    vout: i,
    amount: '0.00000546',
    satoshis: 546,
    height: 1,
    confirmations: 1,
  }));

describe('Services: bounded Blockbook providers', () => {
  let previousBlockbookUrl: string | undefined;

  before(() => {
    previousBlockbookUrl = process.env.BLOCKBOOK_URL;
    // Trailing slash on purpose: the URL helper has to normalize it.
    process.env.BLOCKBOOK_URL = `${HOST}/`;
    // nock installs a global http interceptor on import. Other suites in this
    // process make real network calls, so it has to be uninstalled again when
    // this file is done.
    if (!nock.isActive()) {
      nock.activate();
    }
  });

  after(() => {
    process.env.BLOCKBOOK_URL = previousBlockbookUrl;
    nock.cleanAll();
    nock.enableNetConnect();
    nock.restore();
  });

  beforeEach(() => {
    resetMetricCounters();
    nock.cleanAll();
  });

  describe('fetchAddressUtxos', () => {
    it('requests the v1 UTXO path with the address encoded', async () => {
      const scope = nock(HOST)
        .get(`/api/v1/utxo/${ADDRESS}`)
        .reply(200, givenUtxoRows(2), {'content-type': 'application/json'});

      const rows = await fetchAddressUtxos(ADDRESS);
      expect(rows).to.have.length(2);
      expect(scope.isDone()).to.be.true();
    });

    it('accepts a page exactly at the per-address budget', async () => {
      nock(HOST)
        .get(`/api/v1/utxo/${ADDRESS}`)
        .reply(200, givenUtxoRows(MAX_UTXOS_PER_ADDRESS), {
          'content-type': 'application/json',
        });

      const rows = await fetchAddressUtxos(ADDRESS);
      expect(rows).to.have.length(MAX_UTXOS_PER_ADDRESS);
    });

    it('rejects a page one row over the per-address budget with a 413', async () => {
      nock(HOST)
        .get(`/api/v1/utxo/${ADDRESS}`)
        .reply(200, givenUtxoRows(MAX_UTXOS_PER_ADDRESS + 1), {
          'content-type': 'application/json',
        });

      let caught: any = null;
      try {
        await fetchAddressUtxos(ADDRESS);
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

    it('rejects a non-array payload with a bounded 502', async () => {
      nock(HOST)
        .get(`/api/v1/utxo/${ADDRESS}`)
        .reply(200, {error: 'nope'}, {'content-type': 'application/json'});

      let caught: any = null;
      try {
        await fetchAddressUtxos(ADDRESS);
      } catch (err) {
        caught = err;
      }

      expect(caught).to.not.be.null();
      expect(caught.statusCode).to.equal(502);
    });

    it('surfaces a provider size-budget breach as a bounded 502', async () => {
      // A response far past MAX_PROVIDER_RESPONSE_BYTES: the client aborts the
      // socket rather than materializing it.
      nock(HOST)
        .get(`/api/v1/utxo/${ADDRESS}`)
        .reply(200, JSON.stringify(['x'.repeat(5 * 1024 * 1024)]), {
          'content-type': 'application/json',
        });

      let caught: any = null;
      try {
        await fetchAddressUtxos(ADDRESS);
      } catch (err) {
        caught = err;
      }

      expect(caught).to.not.be.null();
      expect(caught.statusCode).to.equal(502);
      expect(caught.message).to.equal(
        'Provider response exceeded the configured size budget',
      );
      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.PROVIDER_RESPONSE_BYTES,
        }),
      ).to.equal(1);
    });
  });

  describe('fetchAddressInfo', () => {
    it('pins the provider-side page size to the txids budget', async () => {
      const scope = nock(HOST)
        .get(`/api/v2/address/${ADDRESS}`)
        .query({
          details: 'txids',
          pageSize: String(MAX_ADDRESS_INFO_TXIDS),
          page: '1',
        })
        .reply(200, {address: ADDRESS, txs: 0, txids: []}, {
          'content-type': 'application/json',
        });

      await fetchAddressInfo(ADDRESS);
      expect(scope.isDone()).to.be.true();
    });

    it('keeps the single-element array shape consumers index with [0]', async () => {
      nock(HOST)
        .get(`/api/v2/address/${ADDRESS}`)
        .query(true)
        .reply(200, {address: ADDRESS, txs: 1, txids: ['aa']}, {
          'content-type': 'application/json',
        });

      const result = (await fetchAddressInfo(ADDRESS)) as unknown as any[];
      expect(result).to.be.Array();
      expect(result).to.have.length(1);
      expect(result[0].address).to.equal(ADDRESS);
    });

    it('surfaces a provider failure as a bounded 502', async () => {
      nock(HOST)
        .get(`/api/v2/address/${ADDRESS}`)
        .query(true)
        .reply(500, '{}', {'content-type': 'application/json'});

      let caught: any = null;
      try {
        await fetchAddressInfo(ADDRESS);
      } catch (err) {
        caught = err;
      }

      expect(caught).to.not.be.null();
      expect(caught.statusCode).to.equal(502);
    });
  });
});
