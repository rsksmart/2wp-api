import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {
  MAX_REQUEST_DURATION_MS,
  REQUEST_DEADLINE_GRACE_MS,
} from '../../../config/resource-budgets';
import {httpAccessLogMiddleware} from '../../../middleware/http-access-log.middleware';
import {
  getMetricCounter,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {REQUEST_CANCELLED_METRIC} from '../../../utils/request-cancellation';

/**
 * The deadline has to *end* a request, not merely mark it. Work that never
 * observes the abort signal — web3, ethers, mongoose, the REST connector — would
 * otherwise hold the connection open past the deadline with no response, which
 * is the shape a client cannot distinguish from a hung service.
 */
describe('Middleware: request deadline enforcement', () => {
  let clock: sinon.SinonFakeTimers;

  /** A response double recording what was written and whether it was destroyed. */
  const givenResponse = () => {
    const sent: string[] = [];
    const headers: Record<string, string> = {};
    const listeners: Record<string, (() => void)[]> = {};
    const socket = {destroyed: false, destroy: () => {socket.destroyed = true}};
    const response = {
      headersSent: false,
      writableEnded: false,
      writableFinished: false,
      destroyed: false,
      statusCode: 200,
      socket,
      setHeader(name: string, value: string) {
        headers[name] = value;
        return this;
      },
      once(event: string, listener: () => void) {
        (listeners[event] ??= []).push(listener);
        return this;
      },
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      send(payload: string) {
        sent.push(payload);
        this.writableEnded = true;
        this.writableFinished = true;
        return this;
      },
    };
    return {response, sent, headers, socket, listeners};
  };

  const givenRequest = (socket: object) =>
    ({
      method: 'GET',
      path: '/tx-status/0xabc',
      get: () => undefined,
      socket,
    } as never);

  /** Runs the middleware with a handler that never settles. */
  const givenHangingRequest = () => {
    const {response, sent, headers, socket} = givenResponse();
    const ctx = {request: givenRequest(socket), response} as never;
    // Deliberately never resolves: this is the defect being defended against.
    const pending = httpAccessLogMiddleware(ctx, () => new Promise(() => {}));
    return {response, sent, headers, socket, pending};
  };

  beforeEach(() => {
    resetMetricCounters();
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
    sinon.restore();
  });

  it('writes a bounded 503 once the deadline and its grace elapse', async () => {
    const {response, sent} = givenHangingRequest();

    await clock.tickAsync(MAX_REQUEST_DURATION_MS + REQUEST_DEADLINE_GRACE_MS + 1);

    expect(sent).to.have.length(1);
    expect(response.statusCode).to.equal(503);
    const body = JSON.parse(sent[0]);
    expect(body.error.statusCode).to.equal(503);
    expect(body.error.code).to.equal('HTTP_503');
  });

  it('leaves the response alone before the deadline', async () => {
    const {sent} = givenHangingRequest();

    await clock.tickAsync(MAX_REQUEST_DURATION_MS - 1);

    expect(sent).to.have.length(0);
  });

  it('gives cooperative unwinding its grace window first', async () => {
    const {sent} = givenHangingRequest();

    // The signal has aborted by now, but the grace period has not expired, so
    // the handler still owns the response.
    await clock.tickAsync(MAX_REQUEST_DURATION_MS + 1);

    expect(sent).to.have.length(0);
  });

  it('does not write when the handler answered during the grace window', async () => {
    const {response, sent, socket} = givenResponse();
    const ctx = {request: givenRequest(socket), response} as never;
    void httpAccessLogMiddleware(ctx, async () => {
      response.writableEnded = true;
      response.writableFinished = true;
      response.headersSent = true;
    });

    await clock.tickAsync(MAX_REQUEST_DURATION_MS + REQUEST_DEADLINE_GRACE_MS + 1);

    // Forcing a second response onto a request that already answered would be
    // worse than the hang it exists to prevent.
    expect(sent).to.have.length(0);
  });

  it('counts the cancellation exactly once', async () => {
    givenHangingRequest();

    await clock.tickAsync(MAX_REQUEST_DURATION_MS + REQUEST_DEADLINE_GRACE_MS + 1);

    expect(
      getMetricCounter(REQUEST_CANCELLED_METRIC, {reason: 'timeout'}),
    ).to.equal(1);
  });
});
