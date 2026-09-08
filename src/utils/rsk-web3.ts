import Web3 from 'web3';
import Web3HttpProvider from 'web3-providers-http';

/**
 * Builds the Web3 client this service talks to the RSK node with.
 *
 * A factory rather than three `new Web3(url)` calls, because the options below
 * are a security control and a control that has to be repeated in three places
 * is a control that will eventually be applied in two.
 *
 * **`compress: false` is the point of it.** `web3-providers-http` calls
 * `cross-fetch`, which is `node-fetch` under Node, and `node-fetch` decompresses
 * response bodies itself — including Brotli, by constructing a native
 * `zlib.createBrotliDecompress` whenever a response says `Content-Encoding: br`.
 * That decoder is reachable from whatever the node replies, so a compromised or
 * impersonated RSK node could hand this process a decompression bomb on a path
 * that has no size budget in front of it: the bytes are expanded before any of
 * our code sees them.
 *
 * Setting `compress: false` is what closes it rather than narrowing it.
 * `node-fetch` checks the flag *before* it looks at the response's encoding
 * (`node-fetch/lib/index.js:1664`), so with it off no decoder is constructed for
 * any encoding at all and the body arrives as sent. Asking for
 * `Accept-Encoding: identity` alone would not do this: a hostile server is free
 * to ignore the request header, and it is the *response* header that reaches the
 * decoder.
 *
 * The identity header goes with it anyway, because an honest node should not
 * spend CPU compressing something we will not decompress. `node-fetch` only
 * supplies its own `Accept-Encoding` when the caller sets none
 * (`node-fetch/lib/index.js:1359`), so ours is the one that is sent.
 *
 * The `ethers` provider used elsewhere needs none of this: it handles `gzip` and
 * nothing else (`ethers/lib.commonjs/utils/geturl.js:95`), so no Brotli decoder
 * exists on that path to reach.
 *
 * @param host - The node's URL.
 * @returns A Web3 client that never decompresses a response.
 */
export function createRskWeb3(host: string): Web3 {
  return new Web3(
    new Web3HttpProvider(host, {
      // `compress` is a `node-fetch` extension rather than part of `RequestInit`,
      // which is what `HttpProviderOptions` declares — hence the cast. The value
      // reaches `node-fetch` regardless: `web3-providers-http` spreads
      // `providerOptions` straight into the call.
      providerOptions: {
        compress: false,
        headers: {'accept-encoding': 'identity'},
      } as unknown as RequestInit,
    }),
  );
}
