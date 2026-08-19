import {validationError} from '../middleware/bounded-error-writer';

/**
 * Business-level checks on an address list, beyond what the request schema
 * enforces.
 *
 * Redundant with the schema's `minItems`/`maxItems`/`uniqueItems` by design:
 * the schema rejects these payloads before a controller runs, and this is the
 * belt-and-braces layer for any path where schema validation is relaxed or
 * bypassed. Errors use the same `VALIDATION_ERROR` code as schema failures so a
 * client cannot tell the two 422 producers apart.
 *
 * @param list - The address list from the request body.
 * @param opts - `maxItems`, the configured ceiling on list length.
 * @throws {HttpErrors.UnprocessableEntity} If the list is empty, too long, or contains duplicates.
 */
export function validateAddressList(
  list: string[],
  opts: {maxItems: number},
): void {
  if (list.length < 1) {
    throw validationError('addressList must not be empty');
  }
  if (list.length > opts.maxItems) {
    throw validationError(
      `addressList exceeds maximum of ${opts.maxItems} items`,
    );
  }
  const unique = new Set(list);
  if (unique.size !== list.length) {
    throw validationError('addressList must not contain duplicate addresses');
  }
}
