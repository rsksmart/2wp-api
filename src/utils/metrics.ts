import {collectDefaultMetrics, Gauge, Registry} from '@prometheus-io/client';

const packageJson = require('../../package.json');

export const METRICS_PREFIX = 'twp_api_';

export const metricsRegistry = new Registry();

metricsRegistry.setDefaultLabels({env: process.env.DEPLOY_ENV ?? 'local'});

new Gauge({
  name: `${METRICS_PREFIX}build_info`,
  help: 'Build information of the running 2wp-api process; always 1.',
  labelNames: ['version', 'node_version'],
  registers: [metricsRegistry],
}).set(
  {
    version: packageJson.version,
    node_version: process.version,
  },
  1,
);

collectDefaultMetrics({register: metricsRegistry, prefix: METRICS_PREFIX});