import {expect} from '@loopback/testlab';
import {MAX_VALIDATION_ERROR_DETAILS} from '../../../config/resource-budgets';
import {
  boundedAjvFactory,
  truncateValidationErrors,
} from '../../../validation/bounded-ajv.factory';
import {ADDRESS_LIST_MAX_ITEMS} from '../../../config/resource-budgets';
import {BTC_ADDRESS_PATTERN} from '../../../utils/address-patterns';

/** The real `/addresses-info` and `/utxo` request-body schema. */
const addressListSchema = {
  type: 'object',
  properties: {
    addressList: {
      type: 'array',
      items: {type: 'string', pattern: BTC_ADDRESS_PATTERN},
      minItems: 1,
      maxItems: ADDRESS_LIST_MAX_ITEMS,
      uniqueItems: true,
    },
  },
  required: ['addressList'],
  additionalProperties: false,
};

const VALID_ADDRESS = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';

/**
 * Deterministic unique mainnet legacy addresses: '1' + 33 base58 characters.
 * Note base58 excludes 0, I, O and l, so digits cannot be used naively.
 */
function uniqueLegacyMainnet(index: number): string {
  const base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = index + 1;
  let suffix = '';
  while (suffix.length < 33) {
    suffix = base58[n % base58.length] + suffix;
    n = Math.floor(n / base58.length) + 1;
  }
  return `1${suffix}`;
}

describe('Validation: bounded Ajv factory', () => {
  const compile = () => boundedAjvFactory({}).compile(addressListSchema);

  describe('error generation is bounded', () => {
    it('reports exactly one error for a payload with 130 000 invalid items', () => {
      const validate = compile();

      expect(validate({addressList: Array.from({length: 130000}, () => 1)})).to.be.false();
      expect(validate.errors).to.have.length(1);
    });

    it('reports exactly one error however many items are invalid', () => {
      const validate = compile();
      const counts = [1, 10, 1000];

      for (const n of counts) {
        validate({addressList: Array.from({length: n}, () => 'NOT_AN_ADDRESS')});
        expect(validate.errors).to.have.length(1);
      }
    });

    it('short-circuits on maxItems without sweeping every item', () => {
      const validate = compile();
      // Every item is individually valid, so a per-item regex sweep would be
      // the expensive path. maxItems must settle it first.
      const many = Array.from({length: 6000}, (_, i) => uniqueLegacyMainnet(i));

      const started = process.hrtime.bigint();
      expect(validate({addressList: many})).to.be.false();
      const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

      expect(validate.errors![0].keyword).to.equal('maxItems');
      expect(elapsedMs).to.be.lessThan(50);
    });

    it('still reports a single error for an unexpected extra property', () => {
      const validate = compile();

      expect(validate({addressList: [VALID_ADDRESS], surprise: 1})).to.be.false();
      expect(validate.errors).to.have.length(1);
      expect(validate.errors![0].keyword).to.equal('additionalProperties');
    });
  });

  describe('legitimate payloads are unaffected', () => {
    it('accepts a valid single-address body', () => {
      expect(compile()({addressList: [VALID_ADDRESS]})).to.be.true();
    });

    it('accepts a valid body at the address-list maximum', () => {
      const addresses = Array.from({length: ADDRESS_LIST_MAX_ITEMS}, (_, i) =>
        uniqueLegacyMainnet(i),
      );

      expect(compile()({addressList: addresses})).to.be.true();
    });

    it('tolerates the OpenAPI keywords LoopBack schemas carry', () => {
      // LoopBack registers `components` / `x-typescript-type` / `x-index-info`
      // so generated OpenAPI schemas compile. Assert the behaviour rather than
      // the registry: Ajv's getKeyword() reports false for these even on
      // LoopBack's own factory, so it proves nothing.
      expect(() =>
        boundedAjvFactory({}).compile({
          type: 'object',
          components: {schemas: {}},
          'x-typescript-type': 'AddressList',
          'x-index-info': {},
        } as object),
      ).to.not.throw();
    });

    it('keeps the date-time format from ajv-formats', () => {
      const validate = boundedAjvFactory({}).compile({
        type: 'string',
        format: 'date-time',
      });

      expect(validate('2026-08-19T00:00:00Z')).to.be.true();
      expect(validate('not-a-date')).to.be.false();
    });
  });

  describe('truncateValidationErrors', () => {
    const givenErrors = (n: number) =>
      Array.from({length: n}, (_, i) => ({
        keyword: 'pattern',
        instancePath: `/addressList/${i}`,
        schemaPath: '#/properties/addressList/items/pattern',
        params: {pattern: BTC_ADDRESS_PATTERN},
        message: 'must match pattern',
      })) as never[];

    it('caps a large collection at the configured maximum', () => {
      expect(truncateValidationErrors(givenErrors(10000))).to.have.length(
        MAX_VALIDATION_ERROR_DETAILS,
      );
    });

    it('passes a collection at the maximum through untouched', () => {
      const errors = givenErrors(MAX_VALIDATION_ERROR_DETAILS);
      expect(truncateValidationErrors(errors)).to.have.length(
        MAX_VALIDATION_ERROR_DETAILS,
      );
    });

    it('passes a smaller collection through untouched', () => {
      expect(truncateValidationErrors(givenErrors(1))).to.have.length(1);
    });

    it('tolerates a missing collection', () => {
      expect(truncateValidationErrors(undefined as never)).to.deepEqual([]);
      expect(truncateValidationErrors(null as never)).to.deepEqual([]);
    });
  });
});
