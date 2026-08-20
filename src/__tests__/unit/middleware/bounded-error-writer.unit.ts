import {expect} from '@loopback/testlab';
import {HttpErrors} from '@loopback/rest';
import {
  MAX_ERROR_RESPONSE_BYTES,
  MAX_VALIDATION_ERROR_DETAILS,
} from '../../../config/resource-budgets';
import {
  buildBoundedErrorBody,
  FORMAT_REJECTED_METRIC,
  GENERIC_ERROR_MESSAGE,
  recordFormatRejection,
  VALIDATION_ERROR_CODE,
} from '../../../middleware/bounded-error-writer';
import {
  getMetricCounter,
  getMetricCounters,
  resetMetricCounters,
} from '../../../utils/metric-logger';
import {
  RESOURCE_BUDGET_EXCEEDED_METRIC,
  ResourceBudgetName,
} from '../../../utils/resource-budget';

/** A LoopBack request-body validation error, as `RestHttpErrors` builds it. */
const givenValidationError = (detailCount: number) =>
  Object.assign(
    new HttpErrors.UnprocessableEntity(
      'The request body is invalid. See error object `details` property for more info.',
    ),
    {
      code: 'VALIDATION_FAILED',
      details: Array.from({length: detailCount}, (_, i) => ({
        path: `/addressList/${i}`,
        code: 'pattern',
        message: 'must match pattern "^([13mn][a-km-zA-HJ-NP-Z1-9]{25,34}|...)$"',
        info: {pattern: '^([13mn][a-km-zA-HJ-NP-Z1-9]{25,34}|...)$'},
      })),
    },
  );

const serialized = (body: unknown) => JSON.stringify(body);
const byteLength = (body: unknown) => Buffer.byteLength(serialized(body));

describe('Middleware: bounded error writer', () => {
  beforeEach(resetMetricCounters);

  describe('validation errors', () => {
    it('keeps the 422 status and reports a stable code', () => {
      const body = buildBoundedErrorBody(givenValidationError(1), 422);

      expect(body.error.statusCode).to.equal(422);
      expect(body.error.code).to.equal(VALIDATION_ERROR_CODE);
    });

    it('caps the returned details at the configured maximum', () => {
      const body = buildBoundedErrorBody(givenValidationError(10000), 422);

      expect(body.error.details).to.have.length(MAX_VALIDATION_ERROR_DETAILS);
    });

    it('keeps only the path and code of each detail', () => {
      const body = buildBoundedErrorBody(givenValidationError(1), 422);

      expect(body.error.details).to.deepEqual([
        {path: '/addressList/0', code: 'pattern'},
      ]);
    });

    it('never echoes the schema pattern back to the caller', () => {
      const text = serialized(buildBoundedErrorBody(givenValidationError(5), 422));

      expect(text).to.not.match(/a-km-zA-HJ-NP-Z/);
      expect(text).to.not.match(/must match pattern/);
    });
  });

  describe('attacker-controlled content is never reflected', () => {
    it('drops an error message containing request data', () => {
      const marker = 'MARKER_e5400e7b_DROP_TABLE_<script>';
      const err = Object.assign(
        new HttpErrors.BadRequest(`Invalid data "${marker}" for parameter "tx".`),
        {code: 'INVALID_PARAMETER_VALUE'},
      );

      const text = serialized(buildBoundedErrorBody(err, 400));

      expect(text).to.not.match(/MARKER_e5400e7b/);
      expect(text).to.not.match(/script/);
    });

    it('never includes a stack trace', () => {
      const err = new HttpErrors.InternalServerError('boom');
      const text = serialized(buildBoundedErrorBody(err, 500));

      expect(text).to.not.match(/at Object/);
      expect(text).to.not.match(/stack/i);
    });

    it('redacts the message entirely for 5xx', () => {
      const body = buildBoundedErrorBody(
        new HttpErrors.InternalServerError('mongo connection string leaked'),
        500,
      );

      expect(serialized(body)).to.not.match(/mongo/);
      expect(body.error.message).to.equal(GENERIC_ERROR_MESSAGE);
    });

    it('drops a detail path that is not a plain JSON pointer', () => {
      const err = Object.assign(new HttpErrors.UnprocessableEntity('nope'), {
        code: 'VALIDATION_FAILED',
        details: [{path: '<script>alert(1)</script>', code: 'pattern'}],
      });

      expect(serialized(buildBoundedErrorBody(err, 422))).to.not.match(/script/);
    });
  });

  describe('status codes are preserved', () => {
    [400, 404, 413, 415, 422, 500, 502, 504].forEach(status => {
      it(`preserves ${status}`, () => {
        const err = Object.assign(new Error('whatever'), {statusCode: status});
        expect(buildBoundedErrorBody(err, status).error.statusCode).to.equal(status);
      });
    });
  });

  describe('response size budget', () => {
    it('stays inside the budget for a normal validation error', () => {
      expect(byteLength(buildBoundedErrorBody(givenValidationError(1), 422)))
        .to.be.lessThanOrEqual(MAX_ERROR_RESPONSE_BYTES);
    });

    it('stays inside the budget for a pathological error', () => {
      expect(byteLength(buildBoundedErrorBody(givenValidationError(130000), 422)))
        .to.be.lessThanOrEqual(MAX_ERROR_RESPONSE_BYTES);
    });

    it('falls back to the generic body when a detail path is oversized', () => {
      // A single detail whose path alone blows the budget: the only way past the
      // detail cap is one enormous entry.
      const err = Object.assign(new HttpErrors.UnprocessableEntity('nope'), {
        code: 'VALIDATION_FAILED',
        details: [{path: `/${'a'.repeat(MAX_ERROR_RESPONSE_BYTES * 2)}`, code: 'pattern'}],
      });

      const body = buildBoundedErrorBody(err, 422);

      expect(byteLength(body)).to.be.lessThanOrEqual(MAX_ERROR_RESPONSE_BYTES);
      expect(body.error.details).to.be.undefined();
      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.ERROR_RESPONSE_BYTES,
        }),
      ).to.equal(1);
    });

    it('does not record a violation when inside the budget', () => {
      buildBoundedErrorBody(givenValidationError(1), 422);

      expect(
        getMetricCounter(RESOURCE_BUDGET_EXCEEDED_METRIC, {
          resource: ResourceBudgetName.ERROR_RESPONSE_BYTES,
        }),
      ).to.equal(0);
    });
  });
});

describe('Middleware: format rejection metrics', () => {
  beforeEach(resetMetricCounters);

  const rejected = (reason: string) =>
    getMetricCounter(FORMAT_REJECTED_METRIC, {reason});

  const givenError = (
    statusCode: number,
    extra: Record<string, unknown> = {},
  ) => Object.assign(new Error('framework message'), {statusCode, ...extra});

  describe('classification', () => {
    it('counts an unsupported content encoding', () => {
      recordFormatRejection(givenError(415, {type: 'encoding.unsupported'}));

      expect(rejected('content_encoding')).to.equal(1);
      expect(rejected('media_type')).to.equal(0);
    });

    it('counts an unsupported media type', () => {
      recordFormatRejection(givenError(415, {type: 'entity.parse.failed'}));

      expect(rejected('media_type')).to.equal(1);
      expect(rejected('content_encoding')).to.equal(0);
    });

    it('counts a bare 415 as a media type rejection', () => {
      recordFormatRejection(givenError(415));

      expect(rejected('media_type')).to.equal(1);
    });

    it('counts an unroutable request as a method rejection', () => {
      recordFormatRejection(givenError(404));
      recordFormatRejection(givenError(405));

      expect(rejected('method')).to.equal(2);
    });

    it('counts an oversized body', () => {
      recordFormatRejection(givenError(413));

      expect(rejected('body_size')).to.equal(1);
    });

    it('does not count statuses that are not format rejections', () => {
      recordFormatRejection(givenError(422));
      recordFormatRejection(givenError(500));
      recordFormatRejection(givenError(502));

      expect(getMetricCounters()).to.deepEqual({});
    });

    it('counts each rejection exactly once', () => {
      recordFormatRejection(givenError(415, {type: 'encoding.unsupported'}));
      recordFormatRejection(givenError(415, {type: 'encoding.unsupported'}));

      expect(rejected('content_encoding')).to.equal(2);
    });
  });

  describe('labels never carry request data', () => {
    it('ignores an attacker-supplied encoding value', () => {
      // The rejected header value is attacker-controlled and unbounded, so it
      // must never become a metric label - that would be both a cardinality
      // explosion and a data leak into the metrics pipeline.
      recordFormatRejection(
        givenError(415, {
          type: 'encoding.unsupported',
          encoding: 'MARKER_LABEL_LEAK',
        }),
      );

      const keys = Object.keys(getMetricCounters()).join('|');
      expect(keys).to.not.match(/MARKER_LABEL_LEAK/);
      expect(keys).to.match(/reason="content_encoding"/);
    });

    it('keeps the label set to a fixed vocabulary', () => {
      [413, 415, 404].forEach(status => recordFormatRejection(givenError(status)));

      Object.keys(getMetricCounters()).forEach(key => {
        expect(key).to.match(
          /^format_rejected_total\{reason="(content_encoding|media_type|method|body_size)"\}$/,
        );
      });
    });
  });
});
