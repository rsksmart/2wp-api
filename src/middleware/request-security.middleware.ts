import {createHash, timingSafeEqual} from 'node:crypto';
import {HttpErrors, Middleware, Request} from '@loopback/rest';

const API_KEY_HEADER = 'api_key';
const PAYLOAD_HASH_HEADER = 'x-payload-hash';
const API_KEY_ENV_VAR = 'REQUEST_API_KEY';
const SALT_ENV_VAR = 'REQUEST_SALT';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const canonicalizeJson = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(item => canonicalizeJson(item));
  }

  if (!isObject(value)) {
    return value;
  }

  const sortedEntries = Object.keys(value)
    .sort((left, right) => left.localeCompare(right))
    .map(key => [key, canonicalizeJson(value[key])] as const);

  return Object.fromEntries(sortedEntries);
};

const getRequestPayload = (request: Request): string => {
  const payload = request.body;

  if (payload === undefined || payload === null) {
    return '';
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (Buffer.isBuffer(payload)) {
    return payload.toString('utf8');
  }

  return JSON.stringify(canonicalizeJson(payload));
};

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

const secureStringCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
};

export const requestSecurityMiddleware: Middleware = async ({request}, next) => {
  const expectedApiKey = process.env[API_KEY_ENV_VAR];
  const rootstockSalt = process.env[SALT_ENV_VAR];

  if (!expectedApiKey) {
    throw new HttpErrors.InternalServerError('Request API key validation is not configured');
  }

  const providedApiKey = request.header(API_KEY_HEADER);
  if (!providedApiKey) {
    throw new HttpErrors.Unauthorized(`Missing '${API_KEY_HEADER}' header`);
  }

  if (!secureStringCompare(providedApiKey, expectedApiKey)) {
    throw new HttpErrors.Unauthorized('Invalid api key');
  }

  const providedPayloadHash = request.header(PAYLOAD_HASH_HEADER);
  if (!providedPayloadHash) {
    throw new HttpErrors.Unauthorized(`Missing '${PAYLOAD_HASH_HEADER}' header`);
  }

  const payload = getRequestPayload(request);
  const expectedPayloadHash = sha256(sha256(payload+rootstockSalt));

  if (!secureStringCompare(providedPayloadHash.toLowerCase(), expectedPayloadHash)) {
    throw new HttpErrors.Unauthorized('Invalid payload hash');
  }

  return next();
};
