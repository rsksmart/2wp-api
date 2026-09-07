import {expect} from '@loopback/testlab';
import {
  classifyException,
  classifyRejection,
  isResponseLifecycleError,
} from '../../index';

describe('Process: response lifecycle error classification', () => {
  describe('survivable — one request is lost, the process is fine', () => {
    // Unambiguous: these codes only arise from writing to a response that is
    // already finished or gone.
    [
      'ERR_HTTP_HEADERS_SENT',
      'ERR_STREAM_WRITE_AFTER_END',
      'ERR_STREAM_ALREADY_FINISHED',
      'ERR_STREAM_DESTROYED',
    ].forEach(code => {
      it(`treats ${code} as survivable`, () => {
        expect(isResponseLifecycleError(Object.assign(new Error('x'), {code}))).to.be.true();
      });
    });
  });

  describe('resets are survivable only when the response is what broke', () => {
    // ECONNRESET and EPIPE are not response-specific: the same codes arise when
    // Mongo, the RSK node or a provider drops a connection. Swallowing those
    // process-wide leaves a possibly degraded process alive with nothing to
    // restart it — a worse outcome than the per-request failure the allowlist
    // exists for.
    ['ECONNRESET', 'EPIPE'].forEach(code => {
      it(`survives ${code} raised while writing to a peer`, () => {
        expect(
          isResponseLifecycleError(
            Object.assign(new Error('write'), {code, syscall: 'write'}),
          ),
        ).to.be.true();
      });

      it(`is fatal for ${code} carrying an outbound peer identity`, () => {
        // A dependency's connection error names the remote end. A client that
        // vanished mid-response does not.
        expect(
          isResponseLifecycleError(
            Object.assign(new Error('read'), {
              code,
              syscall: 'read',
              address: '10.0.0.5',
              port: 27017,
            }),
          ),
        ).to.be.false();
      });

      it(`is fatal for ${code} with no attributable provenance`, () => {
        expect(
          isResponseLifecycleError(Object.assign(new Error('x'), {code})),
        ).to.be.false();
      });
    });

    it('is fatal for a database read reset', () => {
      // The concrete case: mongoose surfacing a reset from the database.
      expect(
        isResponseLifecycleError(
          Object.assign(new Error('read ECONNRESET'), {
            code: 'ECONNRESET',
            syscall: 'read',
          }),
        ),
      ).to.be.false();
    });
  });

  describe('fatal — the process state is unknown', () => {
    it('does not excuse a programming error', () => {
      expect(isResponseLifecycleError(new TypeError('x is not a function'))).to.be.false();
    });

    it('does not excuse an unrelated system error', () => {
      expect(
        isResponseLifecycleError(Object.assign(new Error('x'), {code: 'ENOSPC'})),
      ).to.be.false();
    });

    it('does not excuse an out-of-memory condition', () => {
      expect(
        isResponseLifecycleError(Object.assign(new Error('heap'), {code: 'ERR_MEMORY'})),
      ).to.be.false();
    });
  });

  describe('degenerate inputs', () => {
    it('tolerates a rejection that is not an Error', () => {
      expect(isResponseLifecycleError('ERR_HTTP_HEADERS_SENT')).to.be.false();
      expect(isResponseLifecycleError(undefined)).to.be.false();
      expect(isResponseLifecycleError(null)).to.be.false();
    });

    it('tolerates a non-string code', () => {
      expect(isResponseLifecycleError({code: 42})).to.be.false();
    });
  });
});

/**
 * The policy the classification feeds, which is not symmetric between the two
 * process events and deliberately so.
 */
describe('Process: failure policy', () => {
  const mongooseFailure = () =>
    Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:27017'), {
      name: 'MongooseServerSelectionError',
    });

  describe('an unhandled rejection is survived', () => {
    it('survives a dependency failure with no recognisable code', () => {
      // The finding, as a classification. A `MongooseServerSelectionError`
      // carries no string `code`, so the allowlist could never have matched it —
      // and the allowlist was a closed list standing in front of an open set.
      expect(classifyRejection(mongooseFailure())).to.equal('survive');
    });

    it('survives a programming error too', () => {
      // Not because a TypeError is harmless, but because one rejected promise
      // is one broken request. Repetition is what says the process is unsound,
      // and repetition is what the tripwire measures.
      expect(classifyRejection(new TypeError('x is not a function'))).to.equal(
        'survive',
      );
    });

    it('still recognises a broken response lifecycle as its own thing', () => {
      // These are not counted against the tripwire: a burst of clients hanging
      // up is normal traffic, and letting it terminate the process would hand
      // any client the outage the allowlist exists to prevent.
      expect(
        classifyRejection(
          Object.assign(new Error('x'), {code: 'ERR_HTTP_HEADERS_SENT'}),
        ),
      ).to.equal('response_lifecycle');
    });
  });

  describe('an uncaught exception is not', () => {
    it('stays fatal for an ordinary error', () => {
      // The inversion applies to rejections only. An exception unwound the stack
      // through arbitrary frames and may have left state half-written; a
      // rejection, in general, did not. Pinned here so nobody widens the
      // inversion to cover it by symmetry.
      expect(classifyException(new Error('boom'))).to.equal('fatal');
    });

    it('stays fatal for a dependency failure', () => {
      expect(classifyException(mongooseFailure())).to.equal('fatal');
    });

    it('keeps the response-lifecycle exemption it already had', () => {
      expect(
        classifyException(
          Object.assign(new Error('x'), {code: 'ERR_STREAM_DESTROYED'}),
        ),
      ).to.equal('response_lifecycle');
    });
  });
});
