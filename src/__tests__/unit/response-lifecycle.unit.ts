import {expect} from '@loopback/testlab';
import {isResponseLifecycleError} from '../../index';

describe('Process: response lifecycle error classification', () => {
  describe('survivable — one request is lost, the process is fine', () => {
    [
      'ERR_HTTP_HEADERS_SENT',
      'ERR_STREAM_WRITE_AFTER_END',
      'ERR_STREAM_ALREADY_FINISHED',
      'ERR_STREAM_DESTROYED',
      'ECONNRESET',
      'EPIPE',
    ].forEach(code => {
      it(`treats ${code} as survivable`, () => {
        expect(isResponseLifecycleError(Object.assign(new Error('x'), {code}))).to.be.true();
      });
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
