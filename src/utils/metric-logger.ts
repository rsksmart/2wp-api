import {Logger} from 'log4js';

const getTime = () => (new Date()).getTime();

export const getMetricLogger = (logger: Logger, methodName: any) => {
  let start = getTime();
  return () => {
    if (process.env.METRICS_ENABLED &&
      process.env.METRICS_ENABLED.toLowerCase() === 'true') {
      logger.trace(`${methodName} took ${getTime() - start}ms`);
    }
  };
};
