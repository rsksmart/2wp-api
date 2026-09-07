import {expect} from '@loopback/testlab';
import nock from 'nock';
import sinon from 'sinon';
import {MAX_PROVIDER_RESPONSE_BYTES} from '../../../config/resource-budgets';
import {broadcastTransaction} from '../../../services/broadcast.service';
import {fetchLastBlock} from '../../../services/btc-last-block.service';
import {
  fetchFeeEstimate,
  flattenFeeResponse,
} from '../../../services/fee-level.service';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {blockbookPermits} from '../../../utils/provider-permits';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

const HOST = 'http://blockbook.test';

/**
 * The three cheap Blockbook calls, after moving off the REST connector.
 *
 * Their responses are hundreds of bytes, so the general provider budget is the
 * right one and the interesting behaviour is not the number — it is that they
 * now abort mid-flight rather than buffering first, take a permit, observe the
 * request's abort signal, and fail as a bounded 502 instead of an unhandled
 * string-length crash.
 */
describe('Services: bounded cheap Blockbook calls', () => {
  let previousBlockbookUrl: string | undefined;

  before(() => {
    previousBlockbookUrl = process.env.BLOCKBOOK_URL;
    process.env.BLOCKBOOK_URL = `${HOST}/`;
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
    sinon.restore();
  });

  describe('the size budget is the general one, and it is enforced', () => {
    // That the client rejects on the declared Content-Length before buffering,
    // and aborts a chunked stream mid-flight, is the client's property and is
    // covered in `bounded-http-client.unit.ts`. What belongs here is which
    // budget these three services hand it, asserted at the edges rather than by
    // spying on the call.
    const jsonHeaders = {'content-type': 'application/json'};

    it('accepts a response exactly at the general budget', async () => {
      // `{"pad":"…"}` is 10 characters of scaffolding, so the padding makes the
      // serialized body exactly the budget — the inclusive edge.
      const body = `{"pad":"${'a'.repeat(MAX_PROVIDER_RESPONSE_BYTES - 10)}"}`;
      expect(body).to.have.length(MAX_PROVIDER_RESPONSE_BYTES);
      nock(HOST).get('/api/blocks').reply(200, body, jsonHeaders);

      await expect(fetchLastBlock()).to.be.fulfilled();
    });

    it('refuses a response past the general budget, as a bounded 502', async () => {
      nock(HOST)
        .get('/api/blocks')
        .reply(200, '{}', {
          ...jsonHeaders,
          'content-length': String(MAX_PROVIDER_RESPONSE_BYTES + 1),
        });

      let caught: any = null;
      try {
        await fetchLastBlock();
      } catch (err) {
        caught = err;
      }

      expect(caught.statusCode).to.equal(502);
      expect(caught.message).to.match(/exceeded the configured size budget/);
    });

    it('records the violation as a scalar, with no payload in it', async () => {
      nock(HOST)
        .get('/api/v1/estimatefee/6')
        .reply(200, '{}', {
          ...jsonHeaders,
          'content-length': String(MAX_PROVIDER_RESPONSE_BYTES + 1),
        });

      await expect(fetchFeeEstimate(6)).to.be.rejected();

      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.PROVIDER_RESPONSE_BYTES,
        }),
      ).to.equal(1);
    });
  });

  describe('the permit pool is used', () => {
    it('takes a permit from the general pool', async () => {
      const run = sinon.spy(blockbookPermits, 'run');
      nock(HOST)
        .get('/api/blocks')
        .reply(200, {blockbook: {}, backend: {}}, {'content-type': 'application/json'});

      await fetchLastBlock();

      sinon.assert.calledOnce(run);
      // Released again, or the pool shrinks permanently.
      expect(blockbookPermits.active).to.equal(0);
    });
  });

  describe('failures map to bounded errors, not to crashes', () => {
    it('maps an upstream 500 to a 502 that carries nothing from upstream', async () => {
      nock(HOST)
        .get('/api/blocks')
        .reply(500, {secret: 'upstream detail'}, {'content-type': 'application/json'});

      let caught: any = null;
      try {
        await fetchLastBlock();
      } catch (err) {
        caught = err;
      }

      expect(caught.statusCode).to.equal(502);
      expect(caught.message).to.not.match(/upstream detail/);
    });

    it('maps a non-JSON body to a bounded 502', async () => {
      nock(HOST)
        .get('/api/v2/sendtx/00')
        .reply(200, '<html>not json</html>', {'content-type': 'text/html'});

      await expect(broadcastTransaction('00')).to.be.rejectedWith(
        /Provider request failed/,
      );
    });
  });

  describe('the shapes the callers depend on survive', () => {
    it('broadcast URL-encodes the hex it puts in the path', async () => {
      // The hex is interpolated into the URL, so anything unexpected in it must
      // not be able to change the request line.
      const scope = nock(HOST)
        .get('/api/v2/sendtx/00%2F..%2Fevil')
        .reply(200, {result: 'ok'}, {'content-type': 'application/json'});

      await broadcastTransaction('00/../evil');

      expect(scope.isDone()).to.be.true();
    });
  });

  describe('flattenFeeResponse', () => {
    it('reproduces $..* on the shape Blockbook actually sends', () => {
      expect(flattenFeeResponse({result: '0.00012'})).to.deepEqual(['0.00012']);
    });

    it('tolerates a null or primitive body without throwing', () => {
      // Fails soft rather than closed on purpose: a malformed fee response
      // should surface as "no estimate", not as a 500 from a helper.
      expect(flattenFeeResponse(null)).to.deepEqual([]);
      expect(flattenFeeResponse('nope')).to.deepEqual([]);
      expect(flattenFeeResponse(undefined)).to.deepEqual([]);
    });
  });
});
