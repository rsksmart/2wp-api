import pino from 'pino';
import type {Logger, LoggerOptions} from 'pino';

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
  hooks: {
    logMethod(args, method, level) {
      const [object, message] = args;
      const isError = object && typeof object === 'object' && 'err' in object && object.err instanceof Error;

      if (level < pino.levels.values.error || !isError) {
        return method.apply(this, args);
      }

      const {err, errorCode, ...errorContext} = object as {err: Error, [key: string]: unknown};
      const normalizedError = {
        errorCode,
        errorMessage: err.message,
        errorStack: err.stack,
        errorContext,
      };

      return method.apply(this, [normalizedError, message]);
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
