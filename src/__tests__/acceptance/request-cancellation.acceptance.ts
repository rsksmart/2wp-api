import net from 'net';
import {expect} from '@loopback/testlab';
import sinon from 'sinon';
import {TwpapiApplication} from '../..';
import {
  ADDRESS_LIST_MAX_ITEMS,
  PROVIDER_CONCURRENCY,
} from '../../config/resource-budgets';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {UtxoProvider} from '../../services';
import {setupApplication, bindPermissiveRateLimiter} from './test-helper';

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

describe('Request cancellation (Acceptance)', () => {
  let app: TwpapiApplication;
  let baseUrl: string;
  let utxoProviderService: UtxoProvider;
  let originalUtxoProvider: UtxoProvider['utxoProvider'];

  before('setupApplication', async () => {
    ({app} = await setupApplication());
    bindPermissiveRateLimiter(app);
    baseUrl = app.restServer.url!;
    // Process-wide singleton: the original has to go back on it in `after`.
    utxoProviderService = await app.get(ServicesBindings.UTXO_PROVIDER_SERVICE);
    originalUtxoProvider = utxoProviderService.utxoProvider;
  });

  beforeEach(() => {
  });

  after(async () => {
    utxoProviderService.utxoProvider = originalUtxoProvider;
    await app.stop();
  });

  /** Sends a full request, then resets the connection after `resetAfterMs`. */
  async function postThenReset(body: string, resetAfterMs: number): Promise<void> {
    const {port, hostname} = new URL(baseUrl);
    const request =
      `POST /utxo HTTP/1.1\r\nHost: ${hostname}\r\n` +
      'Content-Type: application/json\r\n' +
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

    await new Promise<void>(resolve => {
      const socket = net.connect(Number(port), hostname, () => {
        socket.setNoDelay(true);
        socket.write(request);
      });
      socket.on('error', () => resolve());
      setTimeout(() => {
        socket.resetAndDestroy();
        resolve();
      }, resetAfterMs);
    });
  }

  it('stops issuing provider calls once the client has gone', async () => {
    let started = 0;
    utxoProviderService.utxoProvider = async () => {
      started += 1;
      await delay(120);
      return [];
    };

    const body = JSON.stringify({
      addressList: Array.from({length: ADDRESS_LIST_MAX_ITEMS}, (_, i) =>
        uniqueLegacyMainnet(i),
      ),
    });

    await postThenReset(body, 150);
    const atReset = started;

    // Long enough for every remaining batch to have run if nothing stopped it.
    await delay(2500);

    const issuedAfterClientLeft = started - atReset;
    // One in-flight batch may still settle; anything beyond that is work done
    // for a client that is no longer there.
    expect(issuedAfterClientLeft).to.be.lessThanOrEqual(PROVIDER_CONCURRENCY);
    expect(started).to.be.lessThan(ADDRESS_LIST_MAX_ITEMS);
  }).timeout(30000);

  it('still completes a request whose client simply waits', async () => {
    utxoProviderService.utxoProvider = async () => {
      await delay(60);
      return [];
    };

    const res = await fetch(`${baseUrl}/utxo`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({addressList: [uniqueLegacyMainnet(0)]}),
    });

    // Cancellation must never fire on a client that is merely slow.
    expect(res.status).to.equal(200);
  }).timeout(30000);

  it('keeps serving after a cancelled request', async () => {
    utxoProviderService.utxoProvider = async () => [];

    const res = await fetch(`${baseUrl}/api`);
    expect(res.status).to.equal(200);
  }).timeout(30000);
});
