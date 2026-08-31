import {Next} from '@loopback/core';
import {HttpErrors, MiddlewareContext, Request, Response} from '@loopback/rest';
import {
  MAX_ERROR_RESPONSE_BYTES,
  MAX_VALIDATION_ERROR_DETAILS,
} from '../config/resource-budgets';
import {getLogger} from '../utils/logger';
import {incrementMetricCounter} from '../utils/metric-logger';
import {
  recordBudgetViolation,
  ResourceBudgetName,
} from '../utils/resource-budget';
import {getTraceId} from '../utils/trace-context';

const logger = getLogger('error-writer');

/** `code` returned for every request-validation failure. */
export const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';

/**
 * The message a self-describing code publishes, beyond what its status says.
 *
 * Keyed by code, because the codes are precisely what separates conditions that
 * share a status: two different 503s exist, and a client reading only the status
 * cannot tell "the pool is full, come back shortly" from "you outlived your own
 * deadline". Keeping the sentence beside the code that justifies it also makes
 * the next such condition one entry here, instead of two switches that have to
 * be remembered together.
 */
const MESSAGE_BY_CODE: ReadonlyMap<string, string> = new Map([
  [
    'SERVICE_OVERLOADED',
    'Service is at capacity. Retry after the interval given.',
  ],
  ['RATE_LIMITED', 'Too many requests.'],
]);

/**
 * Codes an error may publish for itself, beyond the generic `HTTP_<status>`.
 *
 * Derived from {@link MESSAGE_BY_CODE} rather than listed a second time: a code
 * is self-describing exactly when it has something of its own to say, so the two
 * cannot drift apart. Still a closed set — the code is part of the public
 * contract, so it must not become a passthrough for whatever string an upstream
 * error object carries.
 */
const SELF_DESCRIBING_CODES: ReadonlySet<string> = new Set(
  MESSAGE_BY_CODE.keys(),
);

/** Message returned when nothing more specific can be said safely. */
export const GENERIC_ERROR_MESSAGE = 'Request could not be processed.';

/** Message returned for any request-validation failure. */
export const VALIDATION_ERROR_MESSAGE = 'Invalid request payload.';

/** Counter incremented when a request is refused on format grounds. */
export const FORMAT_REJECTED_METRIC = 'format_rejected_total';

/**
 * The fixed vocabulary of format-rejection reasons. Kept closed so the metric
 * stays low-cardinality: the rejected header values are attacker-controlled and
 * unbounded, so they must never reach a label.
 */
export type FormatRejectionReason =
  | 'content_encoding'
  | 'media_type'
  | 'method'
  | 'body_size';

/**
 * Classifies a refusal by *why* the request was unacceptable, from the status
 * code and the framework's own error type — never from request data.
 *
 * Returns `undefined` for anything that is not a format refusal, so validation
 * failures and upstream errors are not counted here.
 */
const rejectionReason = (err: {
  statusCode?: number;
  status?: number;
  type?: unknown;
}): FormatRejectionReason | undefined => {
  const statusCode = err.statusCode ?? err.status;
  switch (statusCode) {
    case 415:
      // body-parser distinguishes the two 415 causes by `type`; an unsupported
      // encoding is refused before any decompressor is constructed.
      return err.type === 'encoding.unsupported'
        ? 'content_encoding'
        : 'media_type';
    case 413:
      return 'body_size';
    case 404:
    case 405:
      return 'method';
    default:
      return undefined;
  }
};

/**
 * Records a format refusal on the metrics channel.
 *
 * Separate from `recordBudgetViolation` on purpose: a budget violation means a
 * configured ceiling was exceeded, which a rejected media type is not. Folding
 * them together would make `resource_budget_exceeded_total` mean two different
 * things and make either signal useless to alert on.
 *
 * @param err - The error being reported. Only its status and framework-set `type` are read.
 */
export function recordFormatRejection(err: {
  statusCode?: number;
  status?: number;
  type?: unknown;
}): void {
  const reason = rejectionReason(err);
  if (reason) {
    incrementMetricCounter(logger, FORMAT_REJECTED_METRIC, {reason});
  }
}

/** One bounded validation detail: where it failed and which rule failed. */
export interface BoundedErrorDetail {
  /** JSON pointer to the offending field, e.g. `/addressList/0`. */
  path: string;
  /** The validation keyword that failed, e.g. `pattern`. */
  code: string;
}

/** The public error body. Deliberately small and fixed in shape. */
export interface BoundedErrorBody {
  error: {
    statusCode: number;
    code: string;
    message: string;
    details?: BoundedErrorDetail[];
  };
}

/**
 * A JSON pointer as LoopBack generates it. Anything else is dropped rather than
 * echoed — `path` is the one field derived from the request, so it is the one
 * field that has to be proven safe.
 *
 * Deliberately unbounded in length: `MAX_ERROR_RESPONSE_BYTES` is the single
 * owner of response size. A second length cap here would make that budget
 * unreachable, and an unreachable budget is worse than none — it reads as
 * protection while never firing.
 */
const SAFE_POINTER = /^\/[A-Za-z0-9_\-/.[\]]*$/;

/** Ajv keywords are short identifiers; treat anything else as untrusted. */
const SAFE_KEYWORD = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;

/**
 * Fixed, payload-free message for a refusal.
 *
 * A declared code wins over the status: a status can cover two conditions, a
 * code cannot. Everything else falls back to the status, which is what an error
 * with no code of its own gets.
 *
 * @param statusCode - The already-resolved HTTP status.
 * @param isValidation - Whether this is a request-validation failure.
 * @param declaredCode - The already-allowlisted self-describing code, if any.
 * @returns The message to publish.
 */
const messageFor = (
  statusCode: number,
  isValidation: boolean,
  declaredCode?: string,
): string => {
  if (isValidation) {
    return VALIDATION_ERROR_MESSAGE;
  }
  const byCode = declaredCode ? MESSAGE_BY_CODE.get(declaredCode) : undefined;
  if (byCode) {
    return byCode;
  }
  switch (statusCode) {
    case 404:
      return 'Resource not found.';
    case 413:
      return 'Request payload too large.';
    case 415:
      return 'Unsupported media type.';
    case 429:
      // A coded refusal reads this from the table; this is for a 429 raised
      // without one, which still has to say something accurate.
      return 'Too many requests.';
    case 499:
      return 'Client closed the request.';
    case 502:
      return 'Upstream provider request failed.';
    case 503:
      // The 503 with no code of its own: a request that outlived the deadline.
      // The other one — a full provider pool — is refused instantly and spends
      // none of that budget, so it carries `SERVICE_OVERLOADED` and takes its
      // message from the table above.
      return 'Request exceeded its time budget.';
    case 504:
      return 'Upstream provider request timed out.';
    default:
      return GENERIC_ERROR_MESSAGE;
  }
};

/** Is this a request-validation failure rather than some other 4xx? */
const isValidationError = (err: {code?: unknown; details?: unknown}): boolean =>
  err.code === 'VALIDATION_FAILED' ||
  err.code === VALIDATION_ERROR_CODE ||
  Array.isArray(err.details);

/**
 * Reduces the framework's validation details to at most
 * `MAX_VALIDATION_ERROR_DETAILS` entries of `{path, code}`, dropping any entry
 * whose values are not recognisably framework-generated.
 */
const boundDetails = (details: unknown): BoundedErrorDetail[] | undefined => {
  if (!Array.isArray(details) || details.length === 0) {
    return undefined;
  }
  const bounded: BoundedErrorDetail[] = [];
  for (const entry of details) {
    if (bounded.length === MAX_VALIDATION_ERROR_DETAILS) {
      break;
    }
    const path = (entry as {path?: unknown}).path;
    const code = (entry as {code?: unknown}).code;
    if (
      typeof path === 'string' &&
      typeof code === 'string' &&
      SAFE_POINTER.test(path) &&
      SAFE_KEYWORD.test(code)
    ) {
      bounded.push({path, code});
    }
  }
  return bounded.length > 0 ? bounded : undefined;
};

/**
 * Builds the bounded public error body for an error and its resolved status.
 *
 * Nothing derived from the request reaches the output except a validated JSON
 * pointer and an Ajv keyword. Messages are fixed strings chosen by status, so a
 * framework message that embeds request data — `RestHttpErrors.invalidData`
 * interpolates `JSON.stringify(data)` — cannot be reflected. Stack traces,
 * schemas and Ajv `info` objects are never included.
 *
 * If the serialized result would still exceed `MAX_ERROR_RESPONSE_BYTES`, the
 * details are dropped and a budget violation is recorded, so the response size
 * is bounded no matter what the details contained.
 *
 * @param err - The error being reported.
 * @param statusCode - The already-resolved HTTP status code, which is preserved verbatim.
 * @returns The body to serialize.
 */
export function buildBoundedErrorBody(
  err: object,
  statusCode: number,
): BoundedErrorBody {
  const candidate = err as {code?: unknown; details?: unknown};
  const validation = statusCode < 500 && isValidationError(candidate);
  const declared =
    typeof candidate.code === 'string' &&
    SELF_DESCRIBING_CODES.has(candidate.code)
      ? candidate.code
      : undefined;
  const body: BoundedErrorBody = {
    error: {
      statusCode,
      code: validation
        ? VALIDATION_ERROR_CODE
        : (declared ?? `HTTP_${statusCode}`),
      message: messageFor(statusCode, validation, declared),
    },
  };

  const details = validation ? boundDetails(candidate.details) : undefined;
  if (!details) {
    return body;
  }

  const withDetails: BoundedErrorBody = {
    error: {...body.error, details},
  };
  const observed = Buffer.byteLength(JSON.stringify(withDetails));
  if (observed > MAX_ERROR_RESPONSE_BYTES) {
    recordBudgetViolation({
      resource: ResourceBudgetName.ERROR_RESPONSE_BYTES,
      configuredLimit: MAX_ERROR_RESPONSE_BYTES,
      observedValue: observed,
      detail: 'validation details dropped',
    });
    return body;
  }
  return withDetails;
}

/** Resolves the status code the same way LoopBack's default reject provider does. */
const resolveStatusCode = (err: {
  status?: number;
  statusCode?: number;
}): number => err.statusCode ?? err.status ?? 500;

/**
 * Writes a bounded JSON error response, replacing LoopBack's default reject
 * action.
 *
 * Always JSON: the default path hands the error graph to `strong-error-handler`,
 * which negotiates on `Accept` *and* on an undocumented `?_format` query
 * parameter, reaching recursive XML and HTML serializers. Setting
 * `negotiateContentType: false` closes the header route but not `?_format`, so
 * this writer ignores content negotiation entirely.
 *
 * @param request - The inbound request, used only for bounded log metadata.
 * @param response - The response to write.
 * @param err - The error to report.
 */
export function writeBoundedError(
  request: Request,
  response: Response,
  err: Error & {
    code?: unknown;
    details?: unknown;
    status?: number;
    statusCode?: number;
  },
): void {
  // Nothing can be written to a response that is already finished or gone. A
  // client that disappears mid-request leaves exactly this state, and writing
  // anyway throws from inside whatever callback we were invoked from.
  if (response.writableEnded || response.destroyed) {
    return;
  }
  if (response.headersSent) {
    // Part of the response is already on the wire, so it cannot be replaced with
    // an error body; drop the connection instead. The socket may already be gone.
    request.socket?.destroy();
    return;
  }

  const statusCode = resolveStatusCode(err);
  const body = buildBoundedErrorBody(err, statusCode);
  const payload = JSON.stringify(body);

  recordFormatRejection(err as {statusCode?: number; type?: unknown});

  // Bounded metadata only: counts and categories, never the payload or the
  // framework's (possibly input-bearing) message.
  logger.warn(
    {
      httpMethod: request.method,
      httpPath: request.path,
      httpStatusCode: statusCode,
      errorName: err.name,
      validationErrorCount: Array.isArray(err.details) ? err.details.length : 0,
      returnedErrorCount: body.error.details?.length ?? 0,
      validationKeywords: body.error.details?.map(d => d.code),
      responseBytes: Buffer.byteLength(payload),
      traceId: getTraceId(),
    },
    'Request rejected',
  );

  // A refusal that carries a retry hint publishes it, so a client backs off on
  // instruction rather than hammering a service that is already at capacity.
  const retryAfter = (err as {retryAfterSeconds?: unknown}).retryAfterSeconds;
  if (
    typeof retryAfter === 'number' &&
    Number.isFinite(retryAfter) &&
    retryAfter > 0
  ) {
    response.setHeader('Retry-After', String(Math.ceil(retryAfter)));
  }
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.status(statusCode).send(payload);
}

/**
 * Middleware form of the bounded writer, for the `middleware` group.
 *
 * Catching here rather than only replacing the reject action means errors thrown
 * by downstream middleware are bounded too, and the response is written before
 * LoopBack's default writer ever sees the error.
 *
 * @param ctx - Middleware context.
 * @param next - Downstream chain.
 * @returns The downstream result, or nothing when an error was written.
 */
export const boundedErrorWriterMiddleware = async (
  ctx: MiddlewareContext,
  next: Next,
) => {
  try {
    return await next();
  } catch (err) {
    writeBoundedError(
      ctx.request,
      ctx.response,
      err as Error & {statusCode?: number},
    );
    return undefined;
  }
};

/** Re-exported so callers can build the same errors the writer recognises. */
export const validationError = (message: string): HttpErrors.HttpError =>
  Object.assign(new HttpErrors.UnprocessableEntity(message), {
    code: VALIDATION_ERROR_CODE,
  });
