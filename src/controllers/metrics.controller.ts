import {inject} from '@loopback/core';
import {get, RestBindings, Response} from '@loopback/rest';
import {getLogger, Logger} from '../utils/logger';
import {metricsRegistry} from '../utils/metrics';

export const METRICS_PATH = '/internal/metrics';

export class MetricsController {
  private logger: Logger = getLogger('metrics-controller');

  constructor(@inject(RestBindings.Http.RESPONSE) private response: Response) {}

  @get(METRICS_PATH, {
    tags: ['internal'],
    summary: 'Prometheus metrics',
    description:
      'Prometheus scrape target. Internal only: not reachable from public traffic.',
    responses: {
      '200': {
        description: 'Metrics in the Prometheus text exposition format',
        content: {'text/plain': {schema: {type: 'string'}}},
      },
    },
  })
  async getMetrics(): Promise<Response> {
    let body: string;
    try {
      body = await metricsRegistry.metrics();
    } catch (err) {
      this.logger.error({err, method: 'getMetrics'}, 'Failed to collect metrics');
      throw err;
    }
    if (this.response.writableEnded || this.response.destroyed) {
      return this.response;
    }
    this.response
      .status(200)
      .setHeader('Cache-Control', 'no-store')
      .contentType(metricsRegistry.contentType)
      .send(body);
    return this.response;
  }
}
