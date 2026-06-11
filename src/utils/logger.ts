import pino from 'pino';
import type {Logger, LoggerOptions} from 'pino';
import {getTraceId} from './trace-context';

const packageJson = require('../../package.json');

const prettyFormat = process.env.LOG_FORMAT?.toLowerCase() === 'pretty';
const supportedLogLevels = new Set(['debug', 'info', 'warn', 'error', 'fatal']);
const configuredLogLevel = process.env.LOG_LEVEL?.toLowerCase();
const logLevel = configuredLogLevel && supportedLogLevels.has(configuredLogLevel)
  ? configuredLogLevel
  : 'info';
const isoTimestamp = () => `,"timestamp":"${new Date().toISOString()}"`;
const baseRedactPaths = [
  'apiKey',
  'jwt',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'password',
  'secret',
  'privateKey',
  'mnemonic',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  '*.apiKey',
  '*.jwt',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.password',
  '*.secret',
  '*.privateKey',
  '*.mnemonic',
];
const redactPaths = [
  ...baseRedactPaths,
  ...baseRedactPaths.map(path => `errorContext.${path}`),
];

type ErrorPayload = {err: Error; errorCode?: unknown; [key: string]: unknown};

type NormalizedError = {
  errorCode: unknown;
  errorMessage: string;
  errorContext: Record<string, unknown>;
  errorStack?: string;
};

const isErrorPayload = (object: unknown): object is ErrorPayload =>
  !!object && typeof object === 'object' && 'err' in object && (object as ErrorPayload).err instanceof Error;

const normalizeError = ({err, errorCode, ...errorContext}: ErrorPayload, includeStack: boolean): NormalizedError => {
  const normalized: NormalizedError = {errorCode, errorMessage: err.message, errorContext};
  if (includeStack) {
    normalized.errorStack = err.stack;
  }
  return normalized;
};

const options: LoggerOptions = {
  level: logLevel,
  base: {
    service: packageJson.name,
    environment: process.env.NODE_ENV ?? 'development',
    version: packageJson.version,
  },
  messageKey: 'message',
  formatters: {
    level: label => ({level: label}),
  },
  mixin() {
    const traceId = getTraceId();
    return traceId ? {traceId} : {};
  },
  hooks: {
    logMethod(args, method, level) {
      const [object, message] = args;
      if (!isErrorPayload(object)) {
        return method.apply(this, args);
      }
      const includeStack = level >= pino.levels.values.error;
      return method.apply(this, [normalizeError(object, includeStack), message]);
    },
  },
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  timestamp: isoTimestamp,
};


if (prettyFormat) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname,service,environment,version',
      singleLine: true,
    },
  };
}

const rootLogger = pino(options);

export type {Logger} from 'pino';
export const getLogger = (name: string): Logger => rootLogger.child({name});
