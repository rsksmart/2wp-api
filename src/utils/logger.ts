import pino from 'pino';
import type {Logger, LoggerOptions} from 'pino';

const packageJson = require('../../package.json');

const prettyFormat = process.env.LOG_FORMAT?.toLowerCase() === 'pretty';
const redactPaths = [
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

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service: packageJson.name,
    env: process.env.NODE_ENV ?? 'development',
    version: packageJson.version,
  },
  formatters: {
    level: label => ({level: label}),
  },
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

if (prettyFormat) {
  options.transport = {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
    },
  };
}

const rootLogger = pino(options);

export type {Logger} from 'pino';
export const getLogger = (name: string): Logger => rootLogger.child({name});
