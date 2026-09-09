import {PassThrough} from 'stream';
import {expect} from '@loopback/testlab';
import nock from 'nock';
import {
  fetchJsonWithBudget,
  ProviderHttpStatusError,
  ProviderInvalidResponseError,
  ProviderNetworkError,
  ProviderResponseTooLargeError,
  ProviderTimeoutError,
} from '../../../utils/bounded-http-client';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';
import {MAX_PROVIDER_RESPONSE_BYTES} from '../../../config/resource-budgets';

const HOST = 'http://provider.test';
const PATH = '/api/v1/rows';
const URL = `${HOST}${PATH}`;

/** A JSON array whose serialized form is exactly `bytes` long. */
function jsonOfExactSize(bytes: number): string {
  // ["xxx…"] — two brackets and two quotes of overhead.
  const padding = bytes - 4;
  return JSON.stringify(['x'.repeat(padding)]);
}

const call = (overrides: Record<string, unknown> = {}) =>
  fetchJsonWithBudget({
    url: URL,
    operation: 'test.rows',
    maxRetries: 0,
    retryBaseDelayMs: 0,
    timeoutMs: 500,
    maxResponseBytes: 1024,
    ...overrides,
  });

describe('Utils: bounded HTTP client', () => {
  before(() => {
    // nock installs a global http interceptor on import. Other suites in this
    // process make real network calls, so it has to be uninstalled again when
    // this file is done.
    if (!nock.isActive()) {
      nock.activate();
    }
  });

  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
    nock.restore();
  });

  beforeEach(() => {
    resetMetricCounters();
    nock.cleanAll();
  });

  describe('the configured default response budget', () => {
    // Worst-case memory is `in flight x response cap`, so the cap is half of
    // that product and these two cases pin where it sits. A response larger
    // than any the provider has been observed to produce must be refused.
    const UNDER = 1_200_000;
    const OVER = 2_000_000;

    it('accepts a response below the configured default', async () => {
      const body = jsonOfExactSize(UNDER);
      nock(HOST).get(PATH).reply(200, body, {
        'content-type': 'application/json',
      });

      const rows = await call({maxResponseBytes: undefined});

      expect(rows).to.be.an.Array();
    });

    it('refuses a response above the configured default', async () => {
      const body = jsonOfExactSize(OVER);
      nock(HOST).get(PATH).reply(200, body, {
        'content-type': 'application/json',
      });

      await expect(call({maxResponseBytes: undefined})).to.be.rejectedWith(
        ProviderResponseTooLargeError,
      );
    });

    it('sits between the two', () => {
      expect(MAX_PROVIDER_RESPONSE_BYTES).to.be.greaterThan(UNDER);
      expect(MAX_PROVIDER_RESPONSE_BYTES).to.be.lessThan(OVER);
    });
  });

  describe('response size budget', () => {
    it('accepts a response exactly at the byte budget', async () => {
      const body = jsonOfExactSize(1024);
      nock(HOST)
        .get(PATH)
        .reply(200, body, {'content-type': 'application/json'});

      const result = await call();
      expect(result).to.deepEqual(JSON.parse(body));
    });

    it('rejects a response one byte over the budget on the declared length', async () => {
      const body = jsonOfExactSize(1025);
      nock(HOST)
        .get(PATH)
        .reply(200, body, {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(body)),
        });

      await expect(call()).to.be.rejectedWith(ProviderResponseTooLargeError);
    });

    it('rejects an oversized chunked response mid-stream', async () => {
      const body = jsonOfExactSize(4096);
      nock(HOST)
        .get(PATH)
        // No content-length: the tally while streaming is the only guard left.
        .reply(200, body, {
          'content-type': 'application/json',
          'transfer-encoding': 'chunked',
        });

      await expect(call()).to.be.rejectedWith(ProviderResponseTooLargeError);
    });

    it('records the violation as a structured budget signal', async () => {
      const body = jsonOfExactSize(4096);
      nock(HOST)
        .get(PATH)
        .reply(200, body, {'content-type': 'application/json'});

      await expect(call()).to.be.rejected();
      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.PROVIDER_RESPONSE_BYTES,
        }),
      ).to.equal(1);
    });

    it('never retries an oversized response', async () => {
      const body = jsonOfExactSize(4096);
      const scope = nock(HOST)
        .get(PATH)
        .times(2)
        .reply(200, body, {'content-type': 'application/json'});

      await expect(call({maxRetries: 3})).to.be.rejectedWith(
        ProviderResponseTooLargeError,
      );
      // Only the first interceptor was consumed.
      expect(scope.pendingMocks()).to.have.length(1);
    });
  });

  describe('time budget', () => {
    it('accepts a response that arrives inside the deadline', async () => {
      nock(HOST)
        .get(PATH)
        .delay(20)
        .reply(200, '[1]', {'content-type': 'application/json'});

      expect(await call({timeoutMs: 400})).to.deepEqual([1]);
    });

    it('rejects a response that misses the deadline', async () => {
      nock(HOST)
        .get(PATH)
        .delay(300)
        .reply(200, '[1]', {'content-type': 'application/json'});

      await expect(call({timeoutMs: 50})).to.be.rejectedWith(
        ProviderTimeoutError,
      );
    });

    // The three below cover the deadline firing *after* the response has begun,
    // which the two above do not: `delay()` withholds the whole reply, so the
    // client is still waiting for a first byte when the timer fires.
    //
    // A review raised the mid-stream case as a suspected misclassification:
    // `request.destroy(new ProviderTimeoutError(...))` tears down a socket that
    // is already delivering a response, and if the response's `aborted` event
    // reached `finish()` before the request's `error` event, first-write-wins
    // would keep a ProviderNetworkError and drop the timeout — which changes the
    // client's status from 504 to 502 and loses the PROVIDER_TIMEOUT_MS budget
    // record.
    //
    // It does not happen on the runtime this was measured on: destroying a
    // request emits its own `error` first, and `aborted`/`error` on the response
    // arrive afterwards, so the typed reason wins. These assertions are what
    // keeps that true. The ordering is an internal detail of the runtime, not a
    // documented guarantee, so a runtime upgrade is exactly when it could change
    // — and then these go red instead of a 504 quietly becoming a 502.
    // Only a stream that has actually emitted a byte reaches the state this is
    // about. `delayBody` withholds the whole response object, and an unwritten
    // stream never makes nock send the head — both leave the client waiting for
    // a first byte, which is the case the two tests above already cover. Both
    // were tried here and removed rather than kept under a name they did not
    // earn: a mutation that makes the response win the race left them green.
    it('classifies a deadline that fires mid-body as a timeout', async () => {
      // Bytes actually delivered, then silence — the shape a provider that dies
      // half-way through a large page produces.
      const stalled = new PassThrough();
      stalled.write('[1');

      nock(HOST)
        .get(PATH)
        .reply(200, () => stalled, {'content-type': 'application/json'});

      await expect(call({timeoutMs: 50})).to.be.rejectedWith(
        ProviderTimeoutError,
      );

      stalled.destroy();
    });

    it('records a mid-stream timeout as a budget signal, not a network failure', async () => {
      // The observable that actually matters here: a timeout
      // misclassified as a network error still retries the same way, so the only
      // thing lost is the record that a budget was breached.
      const stalled = new PassThrough();
      stalled.write('[1');

      nock(HOST)
        .get(PATH)
        .reply(200, () => stalled, {'content-type': 'application/json'});

      await expect(call({timeoutMs: 50})).to.be.rejected();

      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.PROVIDER_TIMEOUT_MS,
        }),
      ).to.equal(1);

      stalled.destroy();
    });

    it('records the timeout as a structured budget signal', async () => {
      nock(HOST)
        .get(PATH)
        .delay(300)
        .reply(200, '[1]', {'content-type': 'application/json'});

      await expect(call({timeoutMs: 50})).to.be.rejected();
      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.PROVIDER_TIMEOUT_MS,
        }),
      ).to.equal(1);
    });
  });

  describe('explicit JSON expectation', () => {
    it('rejects a response that is not declared as JSON', async () => {
      nock(HOST)
        .get(PATH)
        .reply(200, '[1]', {'content-type': 'text/html; charset=utf-8'});

      await expect(call()).to.be.rejectedWith(ProviderInvalidResponseError);
    });

    it('rejects a body that is not parseable JSON', async () => {
      nock(HOST)
        .get(PATH)
        .reply(200, 'not json', {'content-type': 'application/json'});

      await expect(call()).to.be.rejectedWith(ProviderInvalidResponseError);
    });

    it('accepts a JSON content-type with parameters', async () => {
      nock(HOST)
        .get(PATH)
        .reply(200, '[1]', {'content-type': 'application/json; charset=utf-8'});

      expect(await call()).to.deepEqual([1]);
    });
  });

  describe('status handling and bounded retries', () => {
    it('does not follow redirects', async () => {
      nock(HOST)
        .get(PATH)
        .reply(302, '', {location: `${HOST}/elsewhere`});

      await expect(call()).to.be.rejectedWith(ProviderHttpStatusError);
    });

    it('does not retry a 4xx', async () => {
      const scope = nock(HOST).get(PATH).times(2).reply(404, '{}', {
        'content-type': 'application/json',
      });

      await expect(call({maxRetries: 2})).to.be.rejectedWith(
        ProviderHttpStatusError,
      );
      expect(scope.pendingMocks()).to.have.length(1);
    });

    it('retries a 5xx up to the configured bound and then succeeds', async () => {
      nock(HOST)
        .get(PATH)
        .reply(503, '{}', {'content-type': 'application/json'});
      nock(HOST)
        .get(PATH)
        .reply(200, '[7]', {'content-type': 'application/json'});

      expect(await call({maxRetries: 1})).to.deepEqual([7]);
    });

    it('gives up once the retry bound is spent', async () => {
      nock(HOST)
        .get(PATH)
        .times(2)
        .reply(503, '{}', {'content-type': 'application/json'});

      await expect(call({maxRetries: 1})).to.be.rejectedWith(
        ProviderHttpStatusError,
      );
    });
  });

  describe('URL validation', () => {
    it('rejects a relative URL', async () => {
      await expect(call({url: '/api/v1/rows'})).to.be.rejectedWith(
        ProviderNetworkError,
      );
    });

    it('rejects a non-HTTP protocol', async () => {
      await expect(call({url: 'file:///etc/passwd'})).to.be.rejectedWith(
        ProviderNetworkError,
      );
    });
  });
});
