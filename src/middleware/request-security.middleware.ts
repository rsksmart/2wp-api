import {createHash, timingSafeEqual} from 'node:crypto';
import {HttpErrors, Middleware, Request} from '@loopback/rest';

const API_KEY_HEADER = 'api_key';
const PAYLOAD_HASH_HEADER = 'x-payload-hash';
const API_KEY_ENV_VAR = 'REQUEST_API_KEY';
const SALT_ENV_VAR = 'REQUEST_SALT';
const CACHE_MAX_ENTRIES = 1000;

type CachedResponse = {
  type: 'result';
  result: unknown;
} | {
  type: 'raw';
  statusCode: number;
  contentType?: string;
  payload: Uint8Array;
};

const responseCache = new Map<string, CachedResponse>();

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const buildCacheKey = (request: Request, payloadHash: string): string => {
  const requestUrl = request.originalUrl ?? request.url;
  return `${request.method}:${requestUrl}:${payloadHash}`;
};

const storeCachedResponse = (cacheKey: string, cachedResponse: CachedResponse): void => {
  if (responseCache.has(cacheKey)) {
    responseCache.delete(cacheKey);
  }

  responseCache.set(cacheKey, cachedResponse);

  if (responseCache.size > CACHE_MAX_ENTRIES) {
    const firstKey = responseCache.keys().next().value;
    if (firstKey) {
      responseCache.delete(firstKey);
    }
  }
};

const getContentType = (headerValue: number | string | string[] | undefined): string | undefined => {
  if (typeof headerValue === 'string') {
    return headerValue;
  }

  if (Array.isArray(headerValue)) {
    return headerValue[0];
  }

  return undefined;
};

const concatChunks = (chunks: Uint8Array[]): Uint8Array => {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  chunks.forEach(chunk => {
    merged.set(chunk, offset);
    offset += chunk.length;
  });

  return merged;
};

const secureStringCompare = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(new Uint8Array(leftBuffer), new Uint8Array(rightBuffer));
};

export const requestSecurityMiddleware: Middleware = async ({request, response}, next) => {
  const expectedApiKey = process.env[API_KEY_ENV_VAR];
  const rootstockSalt = process.env[SALT_ENV_VAR];

  if (!expectedApiKey) {
    throw new HttpErrors.InternalServerError();
  }

  if (!rootstockSalt) {
    throw new HttpErrors.InternalServerError();
  }

  const providedApiKey = request.header(API_KEY_HEADER);
  if (!providedApiKey) {
    throw new HttpErrors.Unauthorized();
  }

  if (!secureStringCompare(providedApiKey, expectedApiKey)) {
    throw new HttpErrors.Unauthorized();
  }

  const providedPayloadHash = request.header(PAYLOAD_HASH_HEADER);
  if (!providedPayloadHash) {
    throw new HttpErrors.Unauthorized();
  }

  const normalizedPayloadHash = providedPayloadHash.toLowerCase();
  const payload = getRequestPayload(request);
  const expectedPayloadHash = sha256(sha256(payload + rootstockSalt));

  if (!secureStringCompare(normalizedPayloadHash, expectedPayloadHash)) {
    throw new HttpErrors.Unauthorized();
  }

  const cacheKey = buildCacheKey(request, normalizedPayloadHash);
  const cachedResponse = responseCache.get(cacheKey);
  if (cachedResponse) {
    response.setHeader('x-payload-hash-cache', 'HIT');
    if (cachedResponse.type === 'result') {
      return cachedResponse.result;
    }

    if (cachedResponse.contentType) {
      response.setHeader('content-type', cachedResponse.contentType);
    }
    response.status(cachedResponse.statusCode).send(Buffer.from(cachedResponse.payload));
    return undefined;
  }

  const responseChunks: Uint8Array[] = [];
  const originalWrite = response.write.bind(response);
  const originalEnd = response.end.bind(response);

  const appendChunk = (chunk: unknown, encoding?: BufferEncoding): void => {
    if (chunk === undefined || chunk === null) {
      return;
    }

    if (Buffer.isBuffer(chunk)) {
      responseChunks.push(new Uint8Array(chunk));
      return;
    }

    if (typeof chunk === 'string') {
      responseChunks.push(new Uint8Array(Buffer.from(chunk, encoding)));
    }
  };

  response.write = ((chunk: unknown, ...args: unknown[]) => {
    appendChunk(chunk, args[0] as BufferEncoding | undefined);
    return originalWrite(chunk as never, ...(args as never[]));
  }) as typeof response.write;

  response.end = ((chunk?: unknown, ...args: unknown[]) => {
    appendChunk(chunk, args[0] as BufferEncoding | undefined);
    return originalEnd(chunk as never, ...(args as never[]));
  }) as typeof response.end;

  let result: unknown;

  try {
    result = await next();
  } finally {
    response.write = originalWrite;
    response.end = originalEnd;
  }

  if (result === undefined) {
    const contentType = getContentType(response.getHeader('content-type'));

    storeCachedResponse(cacheKey, {
      type: 'raw',
      statusCode: response.statusCode,
      contentType,
      payload: concatChunks(responseChunks),
    });

    return result;
  }

  storeCachedResponse(cacheKey, {
    type: 'result',
    result,
  });

  return result;
};
