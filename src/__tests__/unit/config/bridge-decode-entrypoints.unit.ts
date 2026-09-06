import fs from 'fs';
import path from 'path';
import {expect} from '@loopback/testlab';

/**
 * Structural properties of the Bridge decode path, in the style of
 * `module-layering.unit.ts`: they read the repository and assert something
 * about its shape that no runtime assertion can express.
 *
 * The point of the 84419 fix is not that a bound exists, it is that the
 * unbounded path stopped existing. `getBridgeTransactionByTxHash` takes a hash
 * and re-fetches the transaction itself, so any guard a caller applies to the
 * transaction it holds is advice rather than a control. Nothing at runtime
 * notices its return — the reintroduction would look like a working feature
 * with no bound, six months from now.
 */
describe('Config: bridge decode entrypoints', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const srcDir = path.join(repoRoot, 'src');
  const testsDir = path.join(srcDir, '__tests__');

  /** Every production `.ts` under `src/`, tests excluded. */
  const productionSources = (dir: string = srcDir): string[] =>
    fs.readdirSync(dir, {withFileTypes: true}).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return full === testsDir ? [] : productionSources(full);
      }
      return entry.isFile() && full.endsWith('.ts') ? [full] : [];
    });

  const grepSourceTree = (pattern: RegExp): string[] =>
    productionSources()
      .filter(file => pattern.test(fs.readFileSync(file, 'utf8')))
      .map(file => path.relative(repoRoot, file))
      .sort();

  it('leaves no production module calling getBridgeTransactionByTxHash', () => {
    // The unguarded path stops existing rather than being avoided by
    // convention. Call syntax, not the bare name: prose explaining why the
    // method is gone is the opposite of the problem, and the characterization
    // suite still calls it deliberately — that is where the two paths are
    // proved equivalent.
    expect(grepSourceTree(/\.getBridgeTransactionByTxHash\(/)).to.deepEqual([]);
  });

  it('decodes bridge transactions from exactly one place', () => {
    // One entry point is what makes "the guard cannot be forgotten" checkable
    // at all. A second caller of `decodeBridgeTransaction` would need its own
    // guard, and nothing would say so.
    expect(grepSourceTree(/\.decodeBridgeTransaction\(/)).to.deepEqual([
      'src/services/rsk-node.service.ts',
    ]);
  });

  it('guards the calldata in the module that decodes it', () => {
    const decoder = path.join(repoRoot, 'src/services/rsk-node.service.ts');
    const source = fs.readFileSync(decoder, 'utf8');
    const guardAt = source.indexOf('assertBridgeCalldataWithinBudget(');
    const decodeAt = source.indexOf('.decodeBridgeTransaction(');

    expect(guardAt).to.be.greaterThan(-1);
    // Ordering matters, not just presence: a bound applied after the decode
    // bounds nothing.
    expect(guardAt).to.be.lessThan(decodeAt);
  });

  it('keeps the ABI helpers free of service imports', () => {
    // `bridge-utils` holds the calldata guard, so both decode paths and the
    // daemon have to be able to import it. It used to construct a
    // `BridgeService` — and a JSON-RPC provider — at import time just to reach
    // an ABI, which made that impossible: `bridge.service.ts` importing it back
    // would have closed the cycle mid-initialization.
    const source = fs.readFileSync(
      path.join(repoRoot, 'src/utils/bridge-utils.ts'),
      'utf8',
    );

    expect(source).to.not.match(/from '\.\.\/services/);
  });
});
