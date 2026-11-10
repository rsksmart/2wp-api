import {model, property} from '@loopback/repository';
import {HEALTH_FAILURE_REASONS} from '../services/provider-health/provider-health-check';

/**
 * One provider's health, as `/health` and `/health/providers` report it.
 *
 * The same shape the swap API reports, so the backoffice reads both APIs the
 * same way. The decorators are the OpenAPI schema of both routes.
 */
@model()
export class ProviderHealthReport {
  /** The provider's backoffice key, in lower case. */
  @property({type: 'string', required: true, jsonSchema: {example: 'powpeg'}})
  provider: string;

  @property({type: 'string', required: true, jsonSchema: {enum: ['up', 'down']}})
  status: 'up' | 'down';

  /** Why the provider is down, as a short code; `null` while it is up. */
  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      nullable: true,
      enum: [...HEALTH_FAILURE_REASONS, null],
      description: 'Why the provider is down; null while it is up',
    },
  })
  reason: string | null;

  /** How long the last check took, in milliseconds. */
  @property({
    type: 'number',
    required: true,
    jsonSchema: {type: 'integer', description: 'How long the last check took'},
  })
  latencyMs: number;

  /** When the last check ended, as an ISO 8601 timestamp. */
  @property({type: 'string', required: true, jsonSchema: {format: 'date-time'}})
  checkedAt: string;

  /** When the status last changed, as an ISO 8601 timestamp. */
  @property({
    type: 'string',
    required: true,
    jsonSchema: {format: 'date-time', description: 'When the status last changed'},
  })
  since: string;
}

/** The body of `GET /health/providers`. */
@model()
export class ProviderHealthResponse {
  @property.array(ProviderHealthReport, {required: true})
  providers: ProviderHealthReport[];
}
