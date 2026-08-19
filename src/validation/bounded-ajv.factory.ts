// ajv, ajv-formats and ajv-keywords are declared in package.json at exactly the
// ranges @loopback/rest declares, so npm keeps one hoisted copy shared with the
// framework rather than resolving a second Ajv.
import Ajv, {ErrorObject, Options as AjvOptions} from 'ajv';
import ajvFormats from 'ajv-formats';
import ajvKeywords from 'ajv-keywords';
// Not part of @loopback/rest's public surface. Imported deliberately so this
// factory registers the same OpenAPI formats the framework's own does; if the
// path moves in a LoopBack upgrade the TypeScript build fails loudly, which is
// the intent — silently dropping formats would weaken validation instead.
import {openapiFormats} from '@loopback/rest/dist/validation/openapi-formats';
import {MAX_VALIDATION_ERROR_DETAILS} from '../config/resource-budgets';

/**
 * Builds the Ajv instance used to validate request bodies, with error
 * generation bounded to the first failure.
 *
 * LoopBack's own factory hard-codes `allErrors: true`, which retains one error
 * object per invalid array item. A single request within the body budget can
 * therefore make Ajv build well over a hundred thousand of them — tens of MB of
 * retained heap — *before* anything is serialized, which is enough to abort the
 * process. Stopping at the first failure removes the allocation entirely rather
 * than merely declining to serialize it.
 *
 * `allErrors: false` cannot be set through `rest.requestBodyParser.validation`,
 * because LoopBack unconditionally installs the `ajv-errors` plugin, which
 * refuses to load unless `allErrors` is true. This factory is supplied through
 * the documented `ValidationOptions.ajvFactory` hook instead and simply omits
 * that plugin — nothing in this service uses its custom `errorMessage` keyword.
 * Everything else LoopBack's factory contributes is kept, so OpenAPI schemas and
 * formats behave identically.
 *
 * @param options - Validation options handed over by LoopBack.
 * @returns A configured Ajv instance that reports at most one error.
 */
export function boundedAjvFactory(options: AjvOptions): Ajv {
  const ajv = new Ajv({
    ...options,
    allErrors: false,
    strictTypes: false,
  });

  // Keywords LoopBack injects so generated OpenAPI schemas compile.
  ajv.addKeyword('components');
  ajv.addKeyword('x-typescript-type');
  ajv.addKeyword('x-index-info');

  ajvKeywords(ajv);
  ajvFormats(ajv);
  for (const format of openapiFormats) {
    ajv.addFormat(format.name, format);
  }

  return ajv;
}

/**
 * Caps a validation-error collection at `MAX_VALIDATION_ERROR_DETAILS`.
 *
 * Wired in as LoopBack's `ajvErrorTransformer`, which runs before the errors are
 * turned into public `details`. With {@link boundedAjvFactory} there is only ever
 * one error to cap, so this is insurance: if the factory is ever reverted or
 * bypassed, the collection still cannot grow without bound past this point.
 *
 * @param errors - Raw Ajv errors. May be missing when Ajv reports none.
 * @returns At most `MAX_VALIDATION_ERROR_DETAILS` errors, in order.
 */
export function truncateValidationErrors(errors: ErrorObject[]): ErrorObject[] {
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors.length > MAX_VALIDATION_ERROR_DETAILS
    ? errors.slice(0, MAX_VALIDATION_ERROR_DETAILS)
    : errors;
}
