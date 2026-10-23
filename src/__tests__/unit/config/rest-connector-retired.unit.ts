import fs from 'fs';
import path from 'path';
import {expect} from '@loopback/testlab';

/**
 * The unbounded connector is gone, asserted structurally.
 *
 * `loopback-connector-rest` buffers a whole provider response before the
 * application sees a byte, which is why a size budget was impossible at that
 * layer and why an oversized `GET /tx` could kill the process. Every path is now
 * on the bounded client; these tests are what stop a sixth datasource quietly
 * reintroducing the connector, which nothing at runtime would notice until the
 * response that kills the process arrives.
 */
describe('Config: the REST connector is retired', () => {
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

  it('leaves no datasource declaring the rest connector', () => {
    // Scoped to `connector: 'rest'` on purpose. `db.datasource.ts` (memory) and
    // `mongodb.datasource.ts` are unaffected and must stay.
    expect(grepSourceTree(/connector:\s*['"]rest['"]/)).to.deepEqual([]);
  });

  it('keeps the datasources that were never the problem', () => {
    const datasources = fs
      .readdirSync(path.join(srcDir, 'datasources'))
      .filter(f => f.endsWith('.datasource.ts'))
      .sort();

    expect(datasources).to.deepEqual([
      'db.datasource.ts',
      'mongodb.datasource.ts',
    ]);
  });

  it('leaves nothing importing the connector or its HTTP client', () => {
    // Import syntax, not the bare name: a comment explaining why the connector
    // is gone is the opposite of the problem, and the docstrings that record how
    // the process used to die name `postman-request` deliberately.
    expect(
      grepSourceTree(
        /(?:from|require\()\s*['"](?:loopback-connector-rest|postman-request)['"]/,
      ),
    ).to.deepEqual([]);
  });

  it('drops loopback-connector-rest from package.json', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
    ) as {dependencies: Record<string, string>};

    expect(pkg.dependencies['loopback-connector-rest']).to.be.undefined();
  });

  it('leaves no rest-datasource-budgets module behind', () => {
    // Its docstring asserted a response-size budget was impossible at that
    // layer. That was never true — `postman-request` supports `maxResponseSize`
    // and aborts mid-flight — and it is doubly not true now that nothing goes
    // through it.
    expect(
      fs.existsSync(path.join(srcDir, 'datasources/rest-datasource-budgets.ts')),
    ).to.be.false();
  });

  it('routes every outbound Blockbook call through the bounded client', () => {
    // The positive half: not merely that the old path is gone, but that the five
    // migrated services are on the new one.
    const migrated = [
      'src/services/tx-service.service.ts',
      'src/services/tx-v2-service.service.ts',
      'src/services/broadcast.service.ts',
      'src/services/fee-level.service.ts',
      'src/services/btc-last-block.service.ts',
    ];

    migrated.forEach(file => {
      const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
      expect(source).to.match(/fetchJsonWithBudget/);
      expect(source).to.match(/maxResponseBytes/);
    });
  });
});
