const Sentry = require("@sentry/node");

const dsn = process.env.SENTRY_DSN;
if (!dsn) {
  throw new Error('SENTRY_DSN is not set');
}

Sentry.init({
  dsn,
  environment: process.env.SENTRY_ENV || 'staging-testnet',
  sendDefaultPii: true,
});
