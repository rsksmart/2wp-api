import {expect} from '@loopback/testlab';
import {isResponseLifecycleError} from '../../index';

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
