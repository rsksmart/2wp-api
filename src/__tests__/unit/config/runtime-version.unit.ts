import fs from 'fs';
import path from 'path';
import {expect} from '@loopback/testlab';

/**
 * The runtime is declared in three places that nothing forces to agree: CI reads
 * `.nvmrc`, the container is built from the `Dockerfile` base image, and
 * `engines` is what npm checks. When they disagree, the version the tests run on
 * is not the version that ships — and an unbounded `engines` range lets an
 * automated base-image bump move production without a code change.
 *
 * These assertions are about the declarations agreeing, not about the code
 * working on that version; only running the suite on it proves that.
 */
describe('Config: declared runtime version', () => {
  const repoRoot = path.resolve(__dirname, '../../../..');
  const read = (file: string) =>
    fs.readFileSync(path.join(repoRoot, file), 'utf8');

  const nvmrcMajor = (): number => {
    const raw = read('.nvmrc').trim();
    const match = /^v?(\d+)\./.exec(raw);
    // .nvmrc must pin a concrete version, not a floating alias like "lts/*".
    expect(match).to.be.ok();
    return Number(match![1]);
  };

  const dockerfileMajors = (): number[] => {
    const matches = [
      ...read('Dockerfile').matchAll(/^FROM\s+node:(\d+)[.\d]*-alpine/gm),
    ];
    // Every stage must build FROM a pinned node:<major>-alpine tag. A build
    // stage on one major and a runtime stage on another compiles against one
    // runtime and ships on a different one.
    expect(matches.length).to.be.greaterThan(0);
    return matches.map(m => Number(m[1]));
  };

  const dockerfileMajor = (): number => {
    const majors = dockerfileMajors();
    expect([...new Set(majors)]).to.have.length(1);
    return majors[0];
  };

  const enginesRange = (): string => {
    const {engines} = JSON.parse(read('package.json'));
    expect(engines?.node).to.be.ok();
    return engines.node as string;
  };

  it('pins a supported, even-numbered Node major', () => {
    // Odd-numbered Node lines never become LTS and stop receiving fixes, so a
    // security-relevant runtime must not sit on one.
    const major = dockerfileMajor();

    expect(major % 2).to.equal(0);
    expect(major).to.be.greaterThanOrEqual(22);
  });

  it('builds the container from the same major CI tests on', () => {
    expect(dockerfileMajor()).to.equal(nvmrcMajor());
  });

  it('bounds engines.node to that major', () => {
    const major = nvmrcMajor();
    const range = enginesRange();

    // A floor alone (">=20.0.0") admits every future major, including
    // odd-numbered and end-of-life lines.
    expect(range).to.match(new RegExp(`>=\\s*${major}\\.`));
    // An upper bound is what stops an automated base-image bump moving the
    // runtime without a code change.
    expect(range).to.match(/</);
    expect(range).to.match(new RegExp(`<\\s*${major + 1}\\.`));
  });

  it('uses the same Node major in every build stage', () => {
    const majors = dockerfileMajors();

    expect([...new Set(majors)]).to.have.length(1);
  });
});
