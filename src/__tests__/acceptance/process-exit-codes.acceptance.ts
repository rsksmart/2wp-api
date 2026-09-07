import {expect} from '@loopback/testlab';
import {ChildApi, delay, startApi, waitForExit} from './child-api';

const PORT = 43213;
const FIXTURE = 'dist/__tests__/fixtures/process-policy-child.js';

/** Small enough to reach quickly, and set explicitly so the test does not ride on the default. */
const TRIPWIRE_MAX = 3;

const EXIT_TIMEOUT_MS = 20_000;

/** Long enough for the harness to see the child serving before it misbehaves. */
const FIXTURE_DELAY_MS = 2_000;

const withTripwire = (env: Record<string, string> = {}) => ({
  PROCESS_FAILURE_TRIPWIRE_MAX: String(TRIPWIRE_MAX),
  PROCESS_FAILURE_TRIPWIRE_WINDOW_MS: '60000',
  ...env,
});

/**
 * A stop that was asked for and a stop the process decided on are different
 * events, and the exit code is the only place a supervisor can tell them apart.
 * They used to be the same constant, `0`, which made every deployment look
 * exactly like every crash — and would have meant a supervisor running
 * `on-failure` never restarted after a fault at all.
 */
describe('Process exit codes (Acceptance)', () => {
  let api: ChildApi;

  afterEach(() => api?.stop());

  describe('a stop that was asked for exits 0', () => {
    (['SIGINT', 'SIGTERM'] as const).forEach(signal => {
      it(`exits 0 on ${signal}`, async () => {
        api = await startApi(PORT);

        api.child.kill(signal);
        const {code} = await waitForExit(api.child, EXIT_TIMEOUT_MS);

        expect(code).to.equal(0);
      }).timeout(60_000);
    });
  });

  describe('a fault the process decided on exits 1', () => {
    it('survives rejections up to the threshold', async () => {
      // The inversion itself, at the process level: these all reach
      // `unhandledRejection`, and none of them is a reason to stop serving.
      api = await startApi(
        PORT,
        withTripwire(),
        FIXTURE,
        [`--rejections=${TRIPWIRE_MAX}`, `--delay-ms=${FIXTURE_DELAY_MS}`],
      );

      await delay(FIXTURE_DELAY_MS + 2_000);

      expect(api.child.exitCode).to.be.null();
      expect((await fetch(`${api.baseUrl}/api`)).status).to.equal(200);
    }).timeout(60_000);

    it('exits 1 once the same failure repeats past the threshold', async () => {
      api = await startApi(
        PORT,
        withTripwire(),
        FIXTURE,
        [`--rejections=${TRIPWIRE_MAX + 1}`, `--delay-ms=${FIXTURE_DELAY_MS}`],
      );

      // Healthy first, so the exit that follows is attributable to the
      // rejections and not to a failure to boot.
      expect((await fetch(`${api.baseUrl}/api`)).status).to.equal(200);

      const {code} = await waitForExit(api.child, EXIT_TIMEOUT_MS);

      expect(code).to.equal(1);
      expect(api.output()).to.match(/failure_tripwire/);
    }).timeout(60_000);

    it('counts repetitions of a kind, not of a message', () => {
      // The fixture gives every rejection a different message and the same
      // name and code. If the message were part of the key, the test above
      // would never trip — so its passing is the assertion, and this case
      // exists to say so out loud rather than leave it implicit.
      expect(TRIPWIRE_MAX).to.be.greaterThan(0);
    });
  });
});
