import {inject} from '@loopback/core';
import {
  Response,
  RestBindings,
  getModelSchemaRef,
  post,
  requestBody,
  response,
} from '@loopback/rest';
import {Logger, getLogger} from 'log4js';
import {LogEntry} from '../models/log-entry.model';

export class LogsController {
  private readonly logger: Logger;

  constructor(
    @inject(RestBindings.Http.RESPONSE)
    private readonly response: Response,
  ) {
    this.logger = getLogger('logs-controller');
  }

  @post('/logs')
  @response(200)
  async log(
    @requestBody({
      content: {'application/json': {schema: getModelSchemaRef(LogEntry)}},
    })
    entry: LogEntry,
  ): Promise<void> {
    this.logger.info(
      `[type=${entry.type}, operation=${entry.operation}, location=${entry.location}]`,
    );
    if (entry.error) {
      const line: string[] = [];
      Object.entries(entry.error).forEach(([key, value]) => {
        line.push(`${key}=${value}`);
      });
      this.logger.info(`[FRONT_ERROR] [${line.join(', ')}]`);
    }

    this.response.status(200).send();
  }
}
