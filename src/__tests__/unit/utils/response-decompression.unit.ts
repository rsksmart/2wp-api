import fs from 'fs';
import http from 'http';
import path from 'path';
import zlib from 'zlib';
import {AddressInfo} from 'net';
import {expect} from '@loopback/testlab';
import Web3 from 'web3';
import {createRskWeb3} from '../../../utils/rsk-web3';

/**
 * A native Brotli decoder must not be reachable from an upstream's reply.
 *
 * The request path is covered elsewhere: `body-parser` throws 415 before it
 * constructs a decompressor, and `withResourceBudgets` pins `inflate: false` in
 * both positions LoopBack reads. This is the other direction, which nothing
 * bounded — a response body is expanded before any of our code sees it, so no
 * size budget stands in front of it. Reaching it needs a compromised or
 * impersonated upstream, which is why it is not urgent; the decoder being in the
 * process image at all is why it is not nothing.
 */
describe('Utils: response decompression is not reachable', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const read = (file: string) =>
    fs.readFileSync(path.join(repoRoot, file), 'utf8');

  describe('against a node that actually sends Brotli', () => {
    /** A compromised upstream: every reply Brotli-compressed, as it is entitled to. */
    let server: http.Server;
    let url: string;

    before(async () => {
      const payload = JSON.stringify({jsonrpc: '2.0', id: 1, result: '0x7a1200'});
      const compressed = zlib.brotliCompressSync(Buffer.from(payload));
      server = http.createServer((_req, res) => {
        res.writeHead(200, {
          'content-type': 'application/json',
          'content-encoding': 'br',
        });
        res.end(compressed);
      });
      await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    after(async () => {
      server.closeAllConnections?.();
      await new Promise<void>(resolve => server.close(() => resolve()));
    });

    it('would decompress it with a default client', async () => {
      // The reachability, demonstrated rather than argued. Without this the test
      // below proves only that a request failed, which it could do for any
      // reason at all.
      const blockNumber = await new Web3(url).eth.getBlockNumber();

      expect(Number(blockNumber)).to.equal(8_000_000);
    }).timeout(20000);

    it('does not decompress it with ours', async () => {
      // The bytes arrive as sent and fail to parse, which is the correct outcome:
      // a body we never expanded cannot be a decompression bomb.
      await expect(createRskWeb3(url).eth.getBlockNumber()).to.be.rejected();
    }).timeout(20000);
  });

  describe('the web3 path, which does decompress', () => {
    it('builds its provider with compression disabled', () => {
      // The property, read off the constructed client rather than off our source:
      // this is what `node-fetch` will actually be handed.
      const web3 = createRskWeb3('http://127.0.0.1:1');
      const provider = web3.provider as unknown as {
        httpProviderOptions?: {providerOptions?: Record<string, unknown>};
      };

      expect(provider.httpProviderOptions?.providerOptions?.compress).to.be.false();
    });

    it('asks the upstream not to compress either', () => {
      const web3 = createRskWeb3('http://127.0.0.1:1');
      const provider = web3.provider as unknown as {
        httpProviderOptions?: {
          providerOptions?: {headers?: Record<string, string>};
        };
      };

      expect(
        provider.httpProviderOptions?.providerOptions?.headers?.[
          'accept-encoding'
        ],
      ).to.equal('identity');
    });

    it('disables it where node-fetch checks before looking at the encoding', () => {
      // The reason `compress: false` closes this rather than narrowing it. If
      // node-fetch ever moved that check below the `br` branch, asking for
      // identity would be all that was left — and a hostile server ignores it.
      const nodeFetch = read('node_modules/node-fetch/lib/index.js');
      const guard = nodeFetch.indexOf('if (!request.compress ||');
      const brotli = nodeFetch.indexOf("codings == 'br'");

      expect(guard).to.be.greaterThan(-1);
      expect(brotli).to.be.greaterThan(-1);
      expect(guard).to.be.lessThan(brotli);
    });
  });

  describe('the other two transports, which do not', () => {
    it('leaves ethers alone, because it only ever handles gzip', () => {
      // Pinned so an ethers upgrade that adds Brotli support becomes a failing
      // test rather than a silently reopened path.
      const geturl = read('node_modules/ethers/lib.commonjs/utils/geturl.js');

      expect(geturl).to.match(/gunzipSync/);
      expect(geturl).to.not.match(/createBrotliDecompress/);
    });

    it('sends identity from our own bounded client', () => {
      // Node's core HTTP client neither negotiates nor performs decompression,
      // so this is belt rather than braces — but an absence is not a control,
      // and a future move onto a decompressing transport should have to delete
      // this line to break it.
      const client = read('src/utils/bounded-http-client.ts');

      expect(client).to.match(/'accept-encoding': 'identity'/);
    });
  });

  describe('no other Web3 client escapes the factory', () => {
    it('constructs every Web3 through createRskWeb3', () => {
      // Three call sites had `new Web3(url)`. A control repeated in three places
      // is a control that eventually gets applied in two.
      const offenders = ['src/services', 'src/utils', 'src/controllers']
        .flatMap(dir => {
          const walk = (d: string): string[] =>
            fs.readdirSync(path.join(repoRoot, d), {withFileTypes: true}).flatMap(e =>
              e.isDirectory()
                ? walk(path.join(d, e.name))
                : e.name.endsWith('.ts')
                  ? [path.join(d, e.name)]
                  : [],
            );
          return walk(dir);
        })
        .filter(file => /new Web3\(/.test(read(file)))
        .filter(file => !file.endsWith('rsk-web3.ts'));

      expect(offenders).to.deepEqual([]);
    });
  });
});
