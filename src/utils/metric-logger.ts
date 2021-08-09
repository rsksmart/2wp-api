import {Logger} from 'log4js';

const getTime = () => new Date().getTime();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getMetricLogger = (logger: Logger, methodName: any) => {
  const start = getTime();
  return () => {
    if (
      process.env.METRICS_ENABLED &&
      process.env.METRICS_ENABLED.toLowerCase() === 'true'
    ) {
      logger.trace(`${methodName} took ${getTime() - start}ms`);
    }
  };
};
