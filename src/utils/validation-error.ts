import {HttpErrors} from '@loopback/rest';

/** The code every request-validation failure publishes, schema or hand-written. */
export const VALIDATION_ERROR_CODE = 'VALIDATION_ERROR';

/**
 * Builds the 422 the bounded error writer recognises as a validation failure.
 *
 * Lives in `utils/` rather than beside the writer so that the inner layer does
 * not have to import the outer one: validation runs in utils and controllers,
 * and the middleware is what renders the result.
 *
 * @param message - Payload-free description of what was wrong with the request.
 * @returns An `UnprocessableEntity` carrying `code: VALIDATION_ERROR`.
 */
export const validationError = (message: string): HttpErrors.HttpError =>
  Object.assign(new HttpErrors.UnprocessableEntity(message), {
    code: VALIDATION_ERROR_CODE,
  });
