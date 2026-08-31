import {ApplicationConfig} from '@loopback/core';
import {expect} from '@loopback/testlab';
import {withResourceBudgets} from '../../application';
import {MAX_REQUEST_BODY_BYTES} from '../../config/resource-budgets';
import {
  boundedAjvFactory,
  truncateValidationErrors,
} from '../../validation/bounded-ajv.factory';

/**
 * The parsers that read the request body, and can therefore construct a
 * decompressor. `stream` is deliberately absent: it hands the raw stream to the
 * controller without reading it.
 */
const BODY_READING_PARSERS = ['json', 'text', 'urlencoded', 'raw'];

/** Reads the merged parser config back without fighting the framework types. */
function parserConfigOf(
  options: ApplicationConfig,
): Record<string, Record<string, unknown>> {
  const parser = options.rest?.requestBodyParser;
  expect(parser).to.not.be.undefined();
  return parser as Record<string, Record<string, unknown>>;
}

/**
 * SECURITY-CRITICAL — see the same label in
 * `src/__tests__/acceptance/format-restrictions.acceptance.ts`.
 *
 * `withResourceBudgets` carries three controls into the REST server: the request
 * body limit, the bounded Ajv hooks, and `inflate: false`. The last one is the
 * *entire* protection against a remote process kill through the runtime's Brotli
 * decoder, and it is permanent rather than interim, because upstream has cut no
 * release containing the decoder fix.
 *
 * These assertions exist because the function used to hand all three back the
 * moment a caller supplied any body-parser configuration of its own. That branch
 * was reachable by a one-line change — widening the text parser's media type to
 * accommodate a client — and no test would have gone red. So what is pinned here is not the
 * shape of the config object: it is which keys a caller may influence and which
 * ones are re-applied over whatever it asked for.
 */
describe('Application: withResourceBudgets', () => {
  describe('with no caller configuration', () => {
    it('applies the body limit and inflate:false to every body-reading parser', () => {
      const parser = parserConfigOf(withResourceBudgets({}));

      expect(parser.limit).to.equal(MAX_REQUEST_BODY_BYTES);
      for (const name of BODY_READING_PARSERS) {
        expect(parser[name]).to.containEql({
          limit: MAX_REQUEST_BODY_BYTES,
          inflate: false,
        });
      }
    });

    it('applies the bounded Ajv hooks', () => {
      const parser = parserConfigOf(withResourceBudgets({}));

      expect(parser.validation.ajvFactory).to.equal(boundedAjvFactory);
      expect(parser.validation.ajvErrorTransformer).to.equal(
        truncateValidationErrors,
      );
    });
  });

  describe('with caller configuration', () => {
    it('keeps the caller’s own parser options and still forces the controls', () => {
      // The realistic future change: someone widens the text parser for a
      // client. Their intent is honoured; the controls are not theirs to drop.
      const result = withResourceBudgets({
        rest: {requestBodyParser: {text: {type: '*/*'}}},
      });

      const parser = parserConfigOf(result);
      expect(parser.text.type).to.equal('*/*');
      expect(parser.text.inflate).to.be.false();
      expect(parser.text.limit).to.equal(MAX_REQUEST_BODY_BYTES);
      expect(parser.json.inflate).to.be.false();
      expect(parser.validation.ajvFactory).to.equal(boundedAjvFactory);
    });

    it('overrides an explicit inflate:true — the flag is all-or-nothing', () => {
      // `inflate` cannot be enabled per codec: turning it on for gzip turns it
      // on for Brotli with it, which is the reachability this control removes.
      const result = withResourceBudgets({
        rest: {requestBodyParser: {json: {inflate: true}}},
      });

      expect(parserConfigOf(result).json.inflate).to.be.false();
    });

    it('caps a caller limit that exceeds the budget, top level and per parser', () => {
      const result = withResourceBudgets({
        rest: {
          requestBodyParser: {
            limit: MAX_REQUEST_BODY_BYTES * 8,
            json: {limit: MAX_REQUEST_BODY_BYTES * 4},
          },
        },
      });

      const parser = parserConfigOf(result);
      expect(parser.limit).to.equal(MAX_REQUEST_BODY_BYTES);
      expect(parser.json.limit).to.equal(MAX_REQUEST_BODY_BYTES);
    });

    it('honours a caller limit that is stricter than the budget', () => {
      // A smaller limit is configuration, not a weakening: the budget is a
      // ceiling, so anything below it is the caller's business.
      const result = withResourceBudgets({
        rest: {requestBodyParser: {limit: 1024, json: {limit: 512}}},
      });

      const parser = parserConfigOf(result);
      expect(parser.limit).to.equal(1024);
      expect(parser.json.limit).to.equal(512);
    });

    it('falls back to the budget for a non-numeric limit', () => {
      // body-parser accepts '1mb'; comparing that against the budget would mean
      // parsing size strings, so an unparsed value fails closed instead.
      const result = withResourceBudgets({
        rest: {requestBodyParser: {limit: '1mb', json: {limit: '512kb'}}},
      });

      const parser = parserConfigOf(result);
      expect(parser.limit).to.equal(MAX_REQUEST_BODY_BYTES);
      expect(parser.json.limit).to.equal(MAX_REQUEST_BODY_BYTES);
    });

    it('replaces a caller ajvFactory but keeps its other validation options', () => {
      const callerFactory = () => {
        throw new Error('the caller’s Ajv factory must never be used');
      };
      const result = withResourceBudgets({
        rest: {
          requestBodyParser: {
            validation: {ajvFactory: callerFactory, $data: true},
          },
        },
      });

      const parser = parserConfigOf(result);
      expect(parser.validation.ajvFactory).to.equal(boundedAjvFactory);
      expect(parser.validation.ajvErrorTransformer).to.equal(
        truncateValidationErrors,
      );
      expect(parser.validation.$data).to.be.true();
    });

    it('passes through a parser it does not govern, without inflate', () => {
      // `stream` never reads the body, so there is no decompressor to disable
      // and nothing for this function to decide about it.
      const result = withResourceBudgets({
        rest: {requestBodyParser: {stream: {type: 'application/octet-stream'}}},
      });

      const parser = parserConfigOf(result);
      expect(parser.stream).to.deepEqual({type: 'application/octet-stream'});
      expect(parser.stream).to.not.have.property('inflate');
    });

    it('leaves the caller’s config object untouched', () => {
      // The result is handed straight to the RestApplication constructor, so a
      // mutation here would be an invisible side effect on the caller's object.
      const options = {
        rest: {port: 0, requestBodyParser: {json: {inflate: true}}},
      };
      const snapshot = JSON.parse(JSON.stringify(options));

      withResourceBudgets(options);

      expect(JSON.parse(JSON.stringify(options))).to.deepEqual(snapshot);
    });
  });
});
