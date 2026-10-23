import fs from 'fs';
import path from 'path';
import {expect} from '@loopback/testlab';
import {builtinParsers} from '@loopback/rest/dist/body-parsers/body-parser.helpers';
import {withResourceBudgets} from '../../../application';

/**
 * Two structural properties that no runtime assertion can express, in the style
 * of `dockerignore.unit.ts` and `runtime-version.unit.ts`: both read the
 * repository and assert something about its shape.
 */
describe('Config: module layering and parser coverage', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const read = (file: string) =>
    fs.readFileSync(path.join(repoRoot, file), 'utf8');

  it('keeps utils from importing middleware', () => {
    // `utils/` is the inner layer: middleware may depend on it, not the reverse.
    // There is no cycle today, only an inverted edge — and `import/no-cycle` is
    // off in `.eslintrc.js`, so nothing else would notice a second one.
    const utilsDir = path.join(repoRoot, 'src/utils');
    const offenders = fs
      .readdirSync(utilsDir)
      .filter(file => file.endsWith('.ts'))
      .filter(file =>
        /from '\.\.\/middleware\//.test(
          fs.readFileSync(path.join(utilsDir, file), 'utf8'),
        ),
      );

    expect(offenders).to.deepEqual([]);
  });

  it('covers or justifies every body parser LoopBack registers', () => {
    // A review read the `raw` entry in `withResourceBudgets` as dead config, on
    // the belief that LoopBack's parser set was json/urlencoded/text/stream. It
    // is not: `RawBodyParser` is registered too and reads its own options. The
    // list is taken from LoopBack itself rather than restated here, so a parser
    // added by an upgrade lands in neither bucket and fails this.
    //
    // `stream` is the justified exemption: it hands the raw stream to the
    // controller without reading it, so there is no decompressor to disable.
    const exempt = new Set(['stream']);
    const parser = withResourceBudgets({}).rest?.requestBodyParser as Record<
      string,
      Record<string, unknown>
    >;

    // `builtinParsers.names` is LoopBack's own list, as symbols.
    const registered = builtinParsers.names.map(name =>
      typeof name === 'symbol' ? String(name.description) : String(name),
    );
    const uncovered = registered.filter(
      name => !exempt.has(name) && parser[name]?.inflate !== false,
    );

    expect(uncovered).to.deepEqual([]);
    // Pinned so an upgrade that adds a sixth parser cannot pass by being
    // silently absent from the list above.
    expect(registered).to.deepEqual([
      'json',
      'urlencoded',
      'text',
      'raw',
      'stream',
    ]);
  });
});
