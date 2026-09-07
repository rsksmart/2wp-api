import net from 'net';
import {expect} from '@loopback/testlab';
import {ChildApi, delay, isServing, startApi} from './child-api';

const PORT = 43211;
const BASE_URL = `http://127.0.0.1:${PORT}`;

/** Writes a raw request then resets the connection on the next macrotask. */
function writeThenReset(request: string): Promise<void> {
  return new Promise(resolve => {
    const socket = net.connect(PORT, '127.0.0.1', () => {
      socket.setNoDelay(true);
      socket.write(request, () => {
        setTimeout(() => {
          socket.resetAndDestroy();
          resolve();
        }, 0);
      });
    });
    socket.on('error', () => resolve());
  });
}

const STATIC_DIR_RESET = 'GET /%2e HTTP/1.1\r\nHost:a\r\n\r\n';
const SPEC_RESET =
  'GET /api HTTP/1.1\r\nHost:a\r\n\r\nGET /openapi.json HTTP/1.1\r\nHost:a\r\n\r\n';

describe('Response lifecycle (Acceptance)', () => {
  let api: ChildApi;

  afterEach(() => api?.stop());

  describe('a client reset cannot terminate the process', () => {
    it('survives a reset while the static root is being resolved', async () => {
      api = await startApi(PORT);
      for (let i = 0; i < 3; i += 1) {
        await writeThenReset(STATIC_DIR_RESET);
        await delay(300);
      }
      await delay(1500);

      expect(await isServing(BASE_URL)).to.be.true();
      expect(api.child.exitCode).to.be.null();
    }).timeout(60000);

    it('survives a reset while the OpenAPI spec is being generated', async () => {
      api = await startApi(PORT);
      for (let i = 0; i < 4; i += 1) {
        await writeThenReset(SPEC_RESET);
        await delay(350);
      }
      await delay(1500);

      expect(await isServing(BASE_URL)).to.be.true();
      expect(api.child.exitCode).to.be.null();
    }).timeout(60000);

    it('survives the same reset with the spec disabled in production', async () => {
      // Documents which environment each variant reaches: the spec route is
      // absent in production, so only the static variant applies there.
      api = await startApi(PORT, {NODE_ENV: 'production'});
      await writeThenReset(SPEC_RESET);
      await delay(300);
      await writeThenReset(STATIC_DIR_RESET);
      await delay(1500);

      expect(await isServing(BASE_URL)).to.be.true();
    }).timeout(60000);
  });

  describe('the landing page is still served', () => {
    it('answers GET / with the landing page as HTML', async () => {
      api = await startApi(PORT);
      const res = await fetch(`${BASE_URL}/`);

      expect(res.status).to.equal(200);
      expect(res.headers.get('content-type')).to.match(/text\/html/);
      expect(await res.text()).to.match(/Two Way Peg API/);
    }).timeout(60000);
  });
});
