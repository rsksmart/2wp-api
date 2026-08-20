import http from 'http';
import {AddressInfo} from 'net';
import {expect} from '@loopback/testlab';
import {
  fetchJsonWithBudget,
  isRetryableError,
} from '../../../utils/bounded-http-client';
import {RequestCancelledError} from '../../../utils/request-cancellation';
import {runWithRequestContext} from '../../../utils/trace-context';

/**
 * A server that accepts connections and never answers, recording how many
 * sockets it saw and how many the client tore down.
 */
function givenSilentServer(): Promise<{
  url: string;
  connections: () => number;
  closed: () => number;
  stop: () => Promise<void>;
}> {
  let connections = 0;
  let closed = 0;
  const server = http.createServer(req => {
    connections += 1;
    req.socket.once('close', () => {
      closed += 1;
    });
    // Deliberately no response.
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}/`,
        connections: () => connections,
        closed: () => closed,
        stop: () =>
          new Promise<void>(done => {
            server.closeAllConnections?.();
            server.close(() => done());
          }),
      });
    });
  });
}

describe('Utils: bounded HTTP client cancellation', () => {
  describe('a cancellation is never retried', () => {
    it('classifies a cancellation as not retryable', () => {
      expect(isRetryableError(new RequestCancelledError())).to.be.false();
    });

    it('makes exactly one attempt when the request is cancelled', async () => {
      const server = await givenSilentServer();
      const controller = new AbortController();
      try {
        const call = runWithRequestContext(
          {traceId: 't', signal: controller.signal},
          () =>
            fetchJsonWithBudget({
              url: server.url,
              operation: 'test.silent',
              // Two attempts would be allowed if this were treated as retryable.
              maxRetries: 3,
              retryBaseDelayMs: 0,
              timeoutMs: 5000,
            }),
        );
        setTimeout(() => controller.abort(), 100);

        await expect(call).to.be.rejectedWith(RequestCancelledError);
        expect(server.connections()).to.equal(1);
      } finally {
        await server.stop();
      }
    }).timeout(20000);

    it('does not even start when the signal is already aborted', async () => {
      const server = await givenSilentServer();
      const controller = new AbortController();
      controller.abort();
      try {
        await expect(
          runWithRequestContext({traceId: 't', signal: controller.signal}, () =>
            fetchJsonWithBudget({url: server.url, operation: 'test.silent'}),
          ),
        ).to.be.rejectedWith(RequestCancelledError);

        expect(server.connections()).to.equal(0);
      } finally {
        await server.stop();
      }
    }).timeout(20000);
  });

  describe('cancellation aborts the outbound socket', () => {
    it('tears the provider connection down rather than abandoning it', async () => {
      const server = await givenSilentServer();
      const controller = new AbortController();
      try {
        const call = runWithRequestContext(
          {traceId: 't', signal: controller.signal},
          () =>
            fetchJsonWithBudget({
              url: server.url,
              operation: 'test.silent',
              maxRetries: 0,
              timeoutMs: 10000,
            }),
        );
        setTimeout(() => controller.abort(), 100);
        await expect(call).to.be.rejected();

        // The point of cancellation: the upstream call actually stops, rather
        // than the promise being abandoned while the socket stays open.
        await new Promise(resolve => setTimeout(resolve, 100));
        expect(server.closed()).to.equal(1);
      } finally {
        await server.stop();
      }
    }).timeout(20000);
  });

  describe('work with no request behind it is never cancelled', () => {
    it('runs normally outside a request context', async () => {
      const server = await givenSilentServer();
      try {
        // The daemon shares these providers; absent a signal the only bound is
        // the provider timeout.
        await expect(
          fetchJsonWithBudget({
            url: server.url,
            operation: 'test.silent',
            maxRetries: 0,
            timeoutMs: 250,
          }),
        ).to.be.rejectedWith(/timed out/);
      } finally {
        await server.stop();
      }
    }).timeout(20000);
  });
});
