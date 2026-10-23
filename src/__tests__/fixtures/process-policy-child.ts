import {main} from '../../index';

/**
 * A real API process, driven into the failure modes the policy is about.
 *
 * The process-level handlers are registered inside `main()`, so nothing short of
 * booting the real entry point exercises them — and no route produces an
 * unhandled rejection on demand, which is exactly as it should be. This fixture
 * is the seam instead: a compiled test artefact that boots the application and
 * then creates genuine floating rejections, so the path under test is the one
 * Node takes in production rather than a synthetic `process.emit`.
 *
 * Usage: `node dist/__tests__/fixtures/process-policy-child.js --appmode=API
 * --rejections=<n> [--delay-ms=<n>]`.
 *
 * `--delay-ms` exists because a fixture that trips the tripwire dies within a
 * millisecond of `main()` resolving — before the harness has confirmed the
 * server is up, so the harness reports "API did not start" instead of the exit
 * code it came to observe. The delay lets the caller establish that the process
 * was healthy first, which is also what makes the exit meaningful.
 */
const argValue = (name: string): string | undefined =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];

async function run(): Promise<void> {
  await main({
    rest: {port: +(process.env.PORT ?? 3000), host: '127.0.0.1'},
  });

  const delayMs = Number(argValue('delay-ms') ?? 0);
  if (delayMs > 0) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }

  const rejections = Number(argValue('rejections') ?? 0);
  for (let i = 0; i < rejections; i += 1) {
    // Floating on purpose, and identical on purpose: the tripwire counts
    // repetitions of one *kind*, so every one of these has to classify the same
    // way. The message differs so the test also proves the message is not part
    // of the key.
    Promise.reject(
      Object.assign(new Error(`synthetic failure ${i}`), {
        name: 'SyntheticStuckDependency',
        code: 'ESYNTHETIC',
      }),
    );
  }
}

run().catch(err => {
  console.error('fixture failed to start', err);
  process.exit(2);
});
