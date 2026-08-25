import fs from 'fs';
import path from 'path';
import {expect} from '@loopback/testlab';

/**
 * The Dockerfile does `COPY . ./`, and Docker does not read `.gitignore`. So
 * anything absent from `.dockerignore` is baked into an image layer, where it
 * survives independently of the running container and travels wherever the image
 * is pushed.
 *
 * Three categories matter, for different reasons:
 *
 * - **Environment files** carry database credentials. An image layer is not a
 *   secret store, and `env_file` / the orchestrator supplies these at run time
 *   anyway, so nothing in the image needs them.
 * - **`.git`** carries the entire history, including anything ever committed and
 *   later removed.
 * - **`.claude`** holds the security informs, which are deliberately the only
 *   place the report identifiers appear; shipping them in a public image would
 *   undo that separation.
 *
 * This asserts the declaration, not the built image — only inspecting a build
 * proves the layer is clean.
 */
describe('Config: .dockerignore', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const entries = (): string[] =>
    fs
      .readFileSync(path.join(repoRoot, '.dockerignore'), 'utf8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'));

  const REQUIRED = [
    // Build inputs that must be rebuilt in the image, not copied from a host.
    'node_modules',
    '/dist',
    // Credentials.
    '.env',
    '.env.*',
    // History.
    '.git',
    // Security informs and local agent state.
    '.claude',
  ];

  REQUIRED.forEach(entry => {
    it(`excludes ${entry} from the build context`, () => {
      expect(entries()).to.containEql(entry);
    });
  });

  it('excludes every environment file, not just the canonical one', () => {
    // `.env.test`, `.env.local`, `.env.production` are all real filenames in
    // this ecosystem and none of them belong in an image.
    const declared = entries();
    expect(declared.some(e => e === '.env')).to.be.true();
    expect(declared.some(e => e === '.env.*' || e === '.env*')).to.be.true();
  });
});
