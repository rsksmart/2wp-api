import {Logger} from './logger';

const getTime = () => (new Date()).getTime();

export const getMetricLogger = (logger: Logger, method: string) => {
  const start = getTime();
  return () => {
    if (process.env.METRICS_ENABLED?.toLowerCase() === 'true') {
      const durationMs = getTime() - start;
      logger.trace({method, durationMs});
    }
  };
};
