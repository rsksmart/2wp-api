import {HttpErrors} from '@loopback/rest';
import {getLogger} from './logger';
import {incrementMetricCounter} from './metric-logger';
import {getTraceId} from './trace-context';

const logger = getLogger('resource-budget');

/** Structured-log `event` value emitted for every budget violation. */
export const RESOURCE_BUDGET_EXCEEDED_EVENT = 'resource_budget_exceeded';

/** Counter incremented for every budget violation, labelled by `resource`. */
export const RESOURCE_BUDGET_EXCEEDED_METRIC = 'resource_budget_exceeded_total';

/**
 * The resource categories a budget can be declared for. One value per budget
 * so logs and metrics can be aggregated per category.
 */
export enum ResourceBudgetName {
  REQUEST_BODY_BYTES = 'request_body_bytes',
  PROVIDER_RESPONSE_BYTES = 'provider_response_bytes',
  PROVIDER_TIMEOUT_MS = 'provider_timeout_ms',
  UTXOS_PER_ADDRESS = 'utxos_per_address',
  UTXO_RESPONSE_ROWS = 'utxo_response_rows',
  ADDRESS_INFO_TXIDS = 'address_info_txids',
  ADDRESS_LIST_ITEMS = 'address_list_items',
  ERROR_RESPONSE_BYTES = 'error_response_bytes',
  VALIDATION_ERROR_DETAILS = 'validation_error_details',
  CONNECTION_BUFFERED_BYTES = 'connection_buffered_bytes',
  REQUEST_DURATION_MS = 'request_duration_ms',
  PROVIDER_PERMITS = 'provider_permits',
  RATE_LIMIT = 'rate_limit',
  MONGO_DOCUMENTS = 'mongo_documents',
}

/**
 * A single budget violation. Everything here is a bounded scalar — never the
 * attacker-controlled payload itself — so the violation can be logged safely.
 */
export interface BudgetViolation {
  /** Which budget was exceeded. */
  resource: ResourceBudgetName;
  /** The configured ceiling for that budget. */
  configuredLimit: number;
  /** What was actually observed (a count, a byte size, a duration). */
  observedValue: number;
  /** Route or internal operation that hit the budget, e.g. `POST /utxo`. */
  route?: string;
  /**
   * Optional short, non-payload clarification, e.g. `'declared offset is not
   * 32-byte aligned'`. Must never embed request or provider data.
   */
  detail?: string;
}

/**
 * Emits the structured observability signals for a budget violation: one
 * `event=resource_budget_exceeded` log line and one counter increment labelled
 * by resource.
 *
 * The payload that triggered the violation is deliberately *not* logged — only
 * the configured limit, the observed scalar, the route and the trace id.
 *
 * @param violation - The violation to record.
 */
export function recordBudgetViolation(violation: BudgetViolation): void {
  const {resource, configuredLimit, observedValue, route, detail} = violation;
  logger.warn(
    {
      event: RESOURCE_BUDGET_EXCEEDED_EVENT,
      resource,
      configuredLimit,
      observedValue,
      route,
      detail,
      traceId: getTraceId(),
    },
    'Resource budget exceeded',
  );
  incrementMetricCounter(logger, RESOURCE_BUDGET_EXCEEDED_METRIC, {resource});
}

/**
 * Human-readable, payload-free message for a violation.
 */
const violationMessage = ({
  resource,
  configuredLimit,
  observedValue,
  detail,
}: BudgetViolation): string => {
  const base =
    `Resource budget exceeded: ${resource} observed ${observedValue}, ` +
    `configured limit ${configuredLimit}`;
  return detail ? `${base} (${detail})` : base;
};

/** How a violation should surface to an HTTP client. */
export type BudgetErrorKind =
  /** The client's own request drove the violation. Maps to 413. */
  | 'client'
  /** A downstream provider drove the violation. Maps to 502. */
  | 'provider';

/**
 * Records a budget violation and builds the bounded HTTP error to reject with.
 *
 * Bounded on purpose: the error carries only scalars, so an oversized request
 * can never be reflected back to the caller (and the process is never torn
 * down — callers throw this and LoopBack turns it into a normal response).
 *
 * @param violation - The violation to record.
 * @param kind - `'client'` for a 413, `'provider'` for a 502. Defaults to `'client'`.
 * @returns The HTTP error to throw.
 */
export function budgetExceededError(
  violation: BudgetViolation,
  kind: BudgetErrorKind = 'client',
): HttpErrors.HttpError {
  recordBudgetViolation(violation);
  const message = violationMessage(violation);
  return kind === 'provider'
    ? new HttpErrors.BadGateway(message)
    : new HttpErrors.PayloadTooLarge(message);
}

/**
 * Asserts an observed scalar is within its budget, recording and throwing a
 * bounded HTTP error when it is not.
 *
 * The check is inclusive: `observedValue === configuredLimit` passes, and
 * `configuredLimit + 1` fails.
 *
 * @param violation - The budget being checked, with the observed value.
 * @param kind - `'client'` for a 413, `'provider'` for a 502. Defaults to `'client'`.
 * @throws {HttpErrors.HttpError} When `observedValue` exceeds `configuredLimit`.
 */
export function assertWithinBudget(
  violation: BudgetViolation,
  kind: BudgetErrorKind = 'client',
): void {
  if (violation.observedValue > violation.configuredLimit) {
    throw budgetExceededError(violation, kind);
  }
}
