import http from 'http';
import {AddressInfo} from 'net';
import {expect} from '@loopback/testlab';
import {ethers} from 'ethers';
import {
  failureReason,
  ProviderCheckFailure,
} from '../../../services/provider-health';
import {
  ProviderHttpStatusError,
  ProviderNetworkError,
  ProviderTimeoutError,
} from '../../../utils/bounded-http-client';

const BRIDGE_ADDRESS = '0x0000000000000000000000000000000001000006';

/**
 * Runs one bridge balance call through a real ethers provider and returns the
 * error it fails with, so these tests see the shapes ethers actually produces
 * rather than hand-built copies of them.
 */
async function ethersErrorFrom(url: string): Promise<unknown> {
  // A fixed network, so ethers makes no detection call of its own and logs no
  // "failed to detect network" retries while the test node is failing.
  const testnet = ethers.Network.from(31);
  const provider = new ethers.JsonRpcProvider(url, testnet, {
    staticNetwork: testnet,
  });
  try {
    await provider.getBalance(BRIDGE_ADDRESS);
    return undefined;
  } catch (err) {
    return err;
  } finally {
    provider.destroy();
  }
}

describe('Provider health: failure reason', () => {
  let server: http.Server;
  let url: string;
  let answer: (res: http.ServerResponse) => void;

  before(done => {
    server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => answer(res));
    });
    server.listen(0, '127.0.0.1', () => {
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  after(done => {
    server.close(() => done());
  });

  describe('from the bounded HTTP client', () => {
    it('reports an HTTP 5xx as http_5xx', () => {
      expect(failureReason(new ProviderHttpStatusError(503))).to.equal('http_5xx');
    });

    it('reports an HTTP 4xx as error', () => {
      expect(failureReason(new ProviderHttpStatusError(404))).to.equal('error');
    });

    it('reports a request past its deadline as timeout', () => {
      expect(failureReason(new ProviderTimeoutError(50))).to.equal('timeout');
    });

    it('reports a refused connection as refused', () => {
      const refused = Object.assign(new Error(''), {code: 'ECONNREFUSED'});
      expect(
        failureReason(Object.assign(new ProviderNetworkError(''), {cause: refused})),
      ).to.equal('refused');
    });
  });

  it('keeps the reason of a check that reached the provider', () => {
    expect(
      failureReason(new ProviderCheckFailure('no_capacity', 'full')),
    ).to.equal('no_capacity');
  });

  it('reports a refused connection as refused', async () => {
    // A port that was just free and is now closed refuses at once.
    const closed = http.createServer();
    await new Promise<void>(resolve => closed.listen(0, '127.0.0.1', resolve));
    const {port} = closed.address() as AddressInfo;
    await new Promise<void>(resolve => closed.close(() => resolve()));

    const err = await ethersErrorFrom(`http://127.0.0.1:${port}`);

    expect(failureReason(err)).to.equal('refused');
  });

  it('reports a refused connection inside an aggregate error as refused', () => {
    // The shape of the AggregateError Node raises when every address of a
    // host refuses (the compile target here predates the AggregateError type).
    const refused = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    const aggregate = Object.assign(new Error('all failed'), {
      errors: [new Error('first address unreachable'), refused],
    });

    expect(failureReason(aggregate)).to.equal('refused');
  });

  [500, 502, 503].forEach(status => {
    it(`reports an HTTP ${status} from the node as http_5xx`, async () => {
      answer = res => res.writeHead(status).end('upstream broke');

      expect(failureReason(await ethersErrorFrom(url))).to.equal('http_5xx');
    });
  });

  it('reports an HTTP 4xx as error, not as a provider failure', async () => {
    // Not 429: ethers retries that one with a backoff.
    answer = res => res.writeHead(400).end('bad request');

    expect(failureReason(await ethersErrorFrom(url))).to.equal('error');
  });

  it('reports a JSON-RPC error as error', async () => {
    answer = res =>
      res
        .writeHead(200, {'content-type': 'application/json'})
        .end(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            error: {code: -32000, message: 'boom'},
          }),
        );

    expect(failureReason(await ethersErrorFrom(url))).to.equal('error');
  });

  it('reports an ethers timeout as timeout', () => {
    const err = ethers.makeError('request timeout', 'TIMEOUT', {
      operation: 'getBalance',
      reason: 'timeout',
    });

    expect(failureReason(err)).to.equal('timeout');
  });

  it('reports a socket timeout as timeout', () => {
    const err = Object.assign(new Error('socket hang up'), {code: 'ETIMEDOUT'});

    expect(failureReason(err)).to.equal('timeout');
  });

  it('finds a code wrapped in a cause', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });

    const wrapped = Object.assign(new Error('call failed'), {cause: refused});

    expect(failureReason(wrapped)).to.equal('refused');
  });

  it('reports anything else as error', () => {
    expect(failureReason(new Error('something else'))).to.equal('error');
    expect(failureReason('a string')).to.equal('error');
    expect(failureReason(undefined)).to.equal('error');
  });

  it('stops on an error that wraps itself', () => {
    const looped: Error & {cause?: unknown} = new Error('looped');
    looped.cause = looped;

    expect(failureReason(looped)).to.equal('error');
  });
});
