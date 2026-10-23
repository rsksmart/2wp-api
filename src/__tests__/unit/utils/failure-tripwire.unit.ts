import {expect} from '@loopback/testlab';
import {
  FailureTripwire,
  failureKind,
  OVERFLOW_KIND,
} from '../../../utils/failure-tripwire';

const MAX = 10;
const WINDOW_MS = 60_000;
const MAX_KINDS = 8;

const err = (name: string, code?: string, message = 'anything') =>
  Object.assign(new Error(message), code === undefined ? {name} : {name, code});

describe('Util: process failure tripwire', () => {
  let clock: number;
  let tripwire: FailureTripwire;

  beforeEach(() => {
    clock = 1_000_000;
    tripwire = new FailureTripwire({
      max: MAX,
      windowMs: WINDOW_MS,
      maxKinds: MAX_KINDS,
      now: () => clock,
    });
  });

  describe('the threshold', () => {
    it('survives everything below it', () => {
      for (let i = 0; i < MAX; i += 1) {
        expect(tripwire.record(err('MongooseServerSelectionError'))).to.be.false();
      }
    });

    it('trips once past it', () => {
      for (let i = 0; i < MAX; i += 1) tripwire.record(err('X'));

      expect(tripwire.record(err('X'))).to.be.true();
    });

    it('counts each kind separately', () => {
      // A process failing two different ways ten times each is not the same
      // signal as one failure repeating twenty times, and only the second is
      // evidence that something is stuck.
      for (let i = 0; i < MAX; i += 1) {
        tripwire.record(err('A'));
        expect(tripwire.record(err('B'))).to.be.false();
      }
    });
  });

  describe('the window', () => {
    it('does not accumulate across windows', () => {
      for (let i = 0; i < MAX; i += 1) tripwire.record(err('X'));

      clock += WINDOW_MS;

      expect(tripwire.record(err('X'))).to.be.false();
    });

    it('still trips on a burst that straddles nothing', () => {
      for (let i = 0; i < MAX; i += 1) {
        clock += 1;
        tripwire.record(err('X'));
      }

      expect(tripwire.record(err('X'))).to.be.true();
    });
  });

  describe('classification', () => {
    it('keys on name and code, never on the message', () => {
      // The message can carry attacker-controlled text. Keying on it would make
      // the tripwire both evadable — vary the message, never repeat a kind — and
      // a way to push arbitrary strings into a process-wide map.
      tripwire.record(err('E', 'X', 'first message'));
      tripwire.record(err('E', 'X', 'a completely different message'));

      expect(tripwire.kinds).to.have.length(1);
    });

    it('never lets a message reach the key', () => {
      tripwire.record(err('E', 'X', 'sentinel-text-from-the-client'));

      expect(tripwire.kinds.join('|')).to.not.match(/sentinel-text/);
    });

    it('separates two kinds that differ only by code', () => {
      tripwire.record(err('E', 'X'));
      tripwire.record(err('E', 'Y'));

      expect(tripwire.kinds).to.have.length(2);
    });

    it('reduces anything unusable to a single fixed key', () => {
      [undefined, null, 'a string', 42, {}, {name: 'x'.repeat(500)}].forEach(
        reason => tripwire.record(reason),
      );

      expect(tripwire.kinds.every(k => /^[A-Za-z0-9_.:-]{1,140}$/.test(k))).to.be
        .true();
    });
  });

  describe('the tripwire is not the amplifier', () => {
    it('stops growing at the key ceiling', () => {
      // Same lesson as RATE_LIMIT_MAX_TRACKED_CLIENTS: a control that allocates
      // per distinct input is a control an attacker can turn into the outage.
      for (let i = 0; i < MAX_KINDS + 100; i += 1) {
        tripwire.record(err(`E${i}`, `C${i}`));
      }

      expect(tripwire.kinds.length).to.be.lessThanOrEqual(MAX_KINDS + 1);
    });

    it('keeps counting past the ceiling, in one bucket', () => {
      // Overflowing must not switch the tripwire off: everything past the
      // ceiling still counts, together.
      for (let i = 0; i < MAX_KINDS; i += 1) tripwire.record(err(`known${i}`));

      let tripped = false;
      for (let i = 0; i < MAX + 1; i += 1) {
        tripped = tripwire.record(err(`overflow${i}`, `code${i}`)) || tripped;
      }

      expect(tripped).to.be.true();
      expect(tripwire.kinds).to.containEql(OVERFLOW_KIND);
    });
  });

  describe('failureKind', () => {
    it('is stable for the same error shape', () => {
      expect(failureKind(err('E', 'X', 'one'))).to.equal(
        failureKind(err('E', 'X', 'two')),
      );
    });

    it('tolerates a rejection that is not an Error', () => {
      expect(failureKind(undefined)).to.be.a.String();
      expect(failureKind(null)).to.be.a.String();
      expect(failureKind('boom')).to.be.a.String();
    });

    it('rejects a name that is not key-shaped rather than storing it', () => {
      const hostile = failureKind(
        Object.assign(new Error('x'), {name: 'A'.repeat(400)}),
      );

      expect(hostile.length).to.be.lessThanOrEqual(140);
    });
  });
});
