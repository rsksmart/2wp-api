import http from 'http';
import {AddressInfo} from 'net';
import {expect} from '@loopback/testlab';
import {TwpapiApplication} from '../..';
import {
  ADDRESS_LIST_MAX_ITEMS,
  BLOCKBOOK_MAX_IN_FLIGHT,
  MAX_ERROR_RESPONSE_BYTES,
} from '../../config/resource-budgets';
import {
  getMetricCounter,
  getMetricGauge,
  resetMetricCounters,
} from '../../utils/metric-logger';
import {
  blockbookPermits,
  PROVIDER_PERMITS_ACTIVE_GAUGE,
  PROVIDER_PERMITS_QUEUED_GAUGE,
  PROVIDER_PERMITS_REJECTED_METRIC,
} from '../../utils/provider-permits';
import {
  BLOCKBOOK_QUEUE_MAX_DEPTH,
  BLOCKBOOK_QUEUE_MAX_WAIT_MS,
  PROVIDER_CONCURRENCY,
} from '../../config/resource-budgets';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** Deterministic unique mainnet legacy addresses: '1' + 33 base58 characters. */
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

/**
 * A stub Blockbook that records the highest number of requests it ever had
 * open at once. That peak is the thing under test: `PROVIDER_CONCURRENCY`
 * bounds one request, and without a process-wide limit N concurrent requests
 * multiply it.
 */
function startBlockbook(rows = 4, defaultLatencyMs = 60) {
  let inFlight = 0;
  let peak = 0;
  let served = 0;
  let latencyMs = defaultLatencyMs;
  let heavy = false;
  const body = JSON.stringify(
    Array.from({length: rows}, (_, i) => ({
      txid: String(i).padStart(64, '0'),
      vout: i,
      amount: '0.001',
      satoshis: 1000,
      height: 1,
      confirmations: 1,
    })),
  );
  // A response close to the configured byte ceiling, which is what makes the
  // in-flight count matter for memory rather than just for socket count. Row
  // count stays inside the per-address budget, so the size comes from wide rows
  // — Blockbook returns more fields per UTXO than this service maps.
  const heavyBody = JSON.stringify(
    Array.from({length: 900}, (_, i) => ({
      txid: String(i).padStart(64, '0'),
      vout: i,
      amount: '0.00100000',
      satoshis: 100000,
      height: 800000,
      confirmations: 6,
      scriptPubKey: 'ab'.repeat(750),
    })),
  );
  const server = http.createServer((_req, res) => {
    inFlight += 1;
    served += 1;
    peak = Math.max(peak, inFlight);
    setTimeout(() => {
      inFlight -= 1;
      res.setHeader('content-type', 'application/json');
      res.end(heavy ? heavyBody : body);
    }, latencyMs);
  });
  return new Promise<{
    url: string;
    peak: () => number;
    served: () => number;
    inFlight: () => number;
    setLatency: (ms: number) => void;
    setHeavy: (value: boolean) => void;
    heavyBytes: () => number;
    reset: () => void;
    stop: () => Promise<void>;
  }>(resolve =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        peak: () => peak,
        served: () => served,
        inFlight: () => inFlight,
        setLatency: (ms: number) => {
          latencyMs = ms;
        },
        setHeavy: (value: boolean) => {
          heavy = value;
        },
        heavyBytes: () => Buffer.byteLength(heavyBody),
        reset: () => {
          latencyMs = defaultLatencyMs;
          heavy = false;
          peak = 0;
          served = 0;
        },
        stop: () =>
          new Promise<void>(done => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      }),
    ),
  );
}

describe('Provider concurrency (Acceptance)', () => {
  let app: TwpapiApplication;
  let baseUrl: string;
  let blockbook: Awaited<ReturnType<typeof startBlockbook>>;
  let previousBlockbookUrl: string | undefined;

  before(async function () {
    this.timeout(60000);
    blockbook = await startBlockbook();
    previousBlockbookUrl = process.env.BLOCKBOOK_URL;
    process.env.BLOCKBOOK_URL = blockbook.url;

    app = new TwpapiApplication({rest: {port: 0, host: '127.0.0.1'}});
    await app.boot();
    await app.start();
    baseUrl = app.restServer.url!;
  });

  after(async () => {
    process.env.BLOCKBOOK_URL = previousBlockbookUrl;
    await app.stop();
    await blockbook.stop();
  });

  beforeEach(() => {
    resetMetricCounters();
    blockbook.reset();
  });

  const fullFanOutBody = JSON.stringify({
    addressList: Array.from({length: ADDRESS_LIST_MAX_ITEMS}, (_, i) =>
      uniqueLegacyMainnet(i),
    ),
  });

  const burstDetailed = async (n: number) =>
    Promise.all(
      Array.from({length: n}, () =>
        fetch(`${baseUrl}/utxo`, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: fullFanOutBody,
        })
          .then(async r => ({
            status: r.status,
            retryAfter: r.headers.get('retry-after'),
            body: await r.text(),
          }))
          .catch(err => ({status: 0, retryAfter: null, body: String(err)})),
      ),
    );

  const burst = async (n: number) =>
    Promise.all(
      Array.from({length: n}, () =>
        fetch(`${baseUrl}/utxo`, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: fullFanOutBody,
        })
          .then(r => r.status)
          .catch(() => 0),
      ),
    );

  it('bounds provider calls in flight across concurrent requests', async () => {
    const statuses = await burst(20);

    // Without a process-wide limit this is PROVIDER_CONCURRENCY x 20 = 100.
    expect(blockbook.peak()).to.be.lessThanOrEqual(BLOCKBOOK_MAX_IN_FLIGHT);
    // The limit must bound work, not discard it.
    expect(statuses.filter(s => s === 200)).to.have.length(20);
  }).timeout(120000);

  it('holds the same bound as concurrency grows', async () => {
    const peaks: number[] = [];
    for (const n of [5, 15, 30]) {
      blockbook.reset();
      await burst(n);
      peaks.push(blockbook.peak());
    }

    peaks.forEach(peak =>
      expect(peak).to.be.lessThanOrEqual(BLOCKBOOK_MAX_IN_FLIGHT),
    );
  }).timeout(180000);

  it('still issues every provider call the requests needed', async () => {
    await burst(4);

    // Bounding concurrency must not silently drop work.
    expect(blockbook.served()).to.equal(4 * ADDRESS_LIST_MAX_ITEMS);
  }).timeout(120000);

  it('returns every permit when the burst is over', async () => {
    await burst(10);
    await delay(200);

    // A leaked permit shrinks the pool permanently, which degrades into an
    // outage that is worse than the exhaustion being prevented.
    expect(
      getMetricGauge(PROVIDER_PERMITS_ACTIVE_GAUGE, {pool: 'blockbook'}),
    ).to.equal(0);
  }).timeout(120000);

  describe('sustained load', () => {
    // Above the in-flight limit so the bound is genuinely exercised, but below
    // the point where the queue overflows, so this measures the bound holding
    // rather than load being shed. One address each, because the aggregate row
    // budget — not the byte budget — is what a wide fan-out would hit first.
    const CONCURRENT = BLOCKBOOK_MAX_IN_FLIGHT + 10;
    const ADDRESSES = 1;
    const WAVES = 3;

    it('holds the bound across sustained waves', async () => {
      blockbook.setHeavy(true);
      blockbook.setLatency(10);
      const body = JSON.stringify({
        addressList: Array.from({length: ADDRESSES}, (_, i) =>
          uniqueLegacyMainnet(i),
        ),
      });

      // Heap is deliberately not asserted here: peak `heapUsed` without a
      // forced collection is dominated by uncollected garbage and varies by
      // over 100 MB between identical runs. The memory claim is measured
      // separately with GC control; what this test owns is the bound itself,
      // which is exact.
      let peakActive = 0;
      const sampler = setInterval(() => {
        peakActive = Math.max(
          peakActive,
          getMetricGauge(PROVIDER_PERMITS_ACTIVE_GAUGE, {pool: 'blockbook'}),
        );
      }, 10);

      for (let wave = 0; wave < WAVES; wave += 1) {
        const statuses = await Promise.all(
          Array.from({length: CONCURRENT}, () =>
            fetch(`${baseUrl}/utxo`, {
              method: 'POST',
              headers: {'content-type': 'application/json'},
              body,
            })
              .then(r => r.status)
              .catch(() => 0),
          ),
        );
        expect(statuses.every(status => status === 200)).to.be.true();
      }
      clearInterval(sampler);

      // The bound is the whole point, and it must hold under sustained load,
      // not just for one burst.
      expect(blockbook.peak()).to.be.lessThanOrEqual(BLOCKBOOK_MAX_IN_FLIGHT);
      expect(peakActive).to.be.lessThanOrEqual(BLOCKBOOK_MAX_IN_FLIGHT);

      await delay(300);
      expect(
        getMetricGauge(PROVIDER_PERMITS_ACTIVE_GAUGE, {pool: 'blockbook'}),
      ).to.equal(0);
      expect(
        getMetricGauge(PROVIDER_PERMITS_QUEUED_GAUGE, {pool: 'blockbook'}),
      ).to.equal(0);
    }).timeout(300000);
  });

  describe('cancellation while queued', () => {
    const CALLS_PER_REQUEST = ADDRESS_LIST_MAX_ITEMS;

    /** Fires `n` requests and abandons them all after `abortAfterMs`. */
    const burstThenAbandon = async (n: number, abortAfterMs: number) => {
      const controllers = Array.from({length: n}, () => new AbortController());
      const inFlight = controllers.map(controller =>
        fetch(`${baseUrl}/utxo`, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: fullFanOutBody,
          signal: controller.signal,
        }).catch(() => undefined),
      );
      await delay(abortAfterMs);
      controllers.forEach(controller => controller.abort());
      await Promise.all(inFlight);
    };

    it('never issues the provider calls a queued-then-abandoned request wanted', async () => {
      // Slow enough that the pool stays saturated and later batches are still
      // queued when the clients disappear.
      blockbook.setLatency(600);
      const requests = 8;

      await burstThenAbandon(requests, 200);
      await delay(1200);

      // Every request wanted CALLS_PER_REQUEST calls; only the batches already
      // on the wire when the clients left should ever have been issued.
      expect(blockbook.served()).to.be.lessThan(requests * CALLS_PER_REQUEST);
      expect(blockbook.served()).to.be.lessThanOrEqual(
        requests * PROVIDER_CONCURRENCY,
      );
    }).timeout(180000);

    it('releases queue capacity as soon as the clients disappear', async () => {
      blockbook.setLatency(600);
      await burstThenAbandon(8, 200);

      // A dead waiter that lingered until BLOCKBOOK_QUEUE_MAX_WAIT_MS would
      // hold capacity against live traffic for seconds.
      await delay(300);
      expect(
        getMetricGauge(PROVIDER_PERMITS_QUEUED_GAUGE, {pool: 'blockbook'}),
      ).to.equal(0);
    }).timeout(180000);

    it('serves a fresh request without waiting out the abandoned queue', async () => {
      blockbook.setLatency(600);
      await burstThenAbandon(8, 200);

      blockbook.setLatency(20);
      const startedAt = Date.now();
      const after = await fetch(`${baseUrl}/utxo`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({addressList: [uniqueLegacyMainnet(0)]}),
      });

      expect(after.status).to.equal(200);
      // Nowhere near the queue's wait budget, which is what a leaked permit or
      // a lingering waiter would cost.
      expect(Date.now() - startedAt).to.be.lessThan(
        BLOCKBOOK_QUEUE_MAX_WAIT_MS,
      );

      // Permits held by calls already on the wire when the clients left are
      // released as those sockets unwind, which is not instantaneous.
      await delay(300);
      expect(
        getMetricGauge(PROVIDER_PERMITS_ACTIVE_GAUGE, {pool: 'blockbook'}),
      ).to.equal(0);
    }).timeout(180000);
  });

  describe('overload', () => {
    // Enough concurrent callers that the pool and its whole queue are occupied
    // at the same instant, which is the only way to observe a refusal.
    const OVERLOAD_REQUESTS =
      Math.ceil(
        (BLOCKBOOK_MAX_IN_FLIGHT + BLOCKBOOK_QUEUE_MAX_DEPTH) /
          PROVIDER_CONCURRENCY,
      ) + 10;

    it('refuses with a bounded 503 carrying Retry-After', async () => {
      const results = await burstDetailed(OVERLOAD_REQUESTS);
      const refused = results.filter(r => r.status === 503);

      // Shedding load is the designed behaviour; a 500 or a hang is not.
      expect(refused.length).to.be.greaterThan(0);
      results.forEach(r => expect([200, 503]).to.containEql(r.status));

      refused.forEach(r => {
        // Without Retry-After a client has no basis for backing off, so a
        // retry storm turns overload into an outage.
        expect(r.retryAfter).to.match(/^[0-9]+$/);
        // The refusal must not be another amplification vector.
        expect(r.body.length).to.be.lessThanOrEqual(MAX_ERROR_RESPONSE_BYTES);
        // A request that outlived its deadline also answers 503, so the code is
        // what tells a client whether retrying is worth anything.
        expect(JSON.parse(r.body).error.code).to.equal('SERVICE_OVERLOADED');
      });
    }).timeout(180000);

    it('counts refusals with a reason', async () => {
      await burstDetailed(OVERLOAD_REQUESTS);

      expect(
        getMetricCounter(PROVIDER_PERMITS_REJECTED_METRIC, {
          pool: 'blockbook',
          reason: 'queue_full',
        }),
      ).to.be.greaterThan(0);
    }).timeout(180000);

    it('still serves a normal request after being overloaded', async () => {
      await burstDetailed(OVERLOAD_REQUESTS);
      await delay(300);

      const after = await fetch(`${baseUrl}/utxo`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({addressList: [uniqueLegacyMainnet(0)]}),
      });

      expect(after.status).to.equal(200);
      expect(
        getMetricGauge(PROVIDER_PERMITS_ACTIVE_GAUGE, {pool: 'blockbook'}),
      ).to.equal(0);
    }).timeout(180000);
  });
});
