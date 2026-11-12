import {model, property} from '@loopback/repository';
import {HEALTH_FAILURE_REASONS} from '../services/provider-health/provider-health-check';

@model()
export class LiquidityProviderHealthReport {
  @property({type: 'number', required: true, jsonSchema: {type: 'integer', example: 1}})
  id: number;

  @property({type: 'string', required: true, jsonSchema: {example: 'Default Provider'}})
  name: string;

  @property({type: 'string', required: true, jsonSchema: {enum: ['up', 'down']}})
  status: 'up' | 'down';

  @property({
    type: 'string',
    required: true,
    jsonSchema: {
      nullable: true,
      enum: [...HEALTH_FAILURE_REASONS, null],
      description: 'Why the LP is down; null while it is up',
    },
  })
  reason: string | null;

  @property({
    type: 'number',
    required: true,
    jsonSchema: {type: 'integer', description: "How long the LP's last check took"},
  })
  latencyMs: number;

  @property({type: 'string', required: true, jsonSchema: {format: 'date-time'}})
  checkedAt: string;

  @property({
    type: 'string',
    required: true,
    jsonSchema: {format: 'date-time', description: "When the LP's status last changed"},
  })
  since: string;
}

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

  @property.array(LiquidityProviderHealthReport, {
    jsonSchema: {description: 'Only on flyover: the health of each liquidity provider'},
  })
  liquidityProviders?: LiquidityProviderHealthReport[];
}

/** The body of `GET /health/providers`. */
@model()
export class ProviderHealthResponse {
  @property.array(ProviderHealthReport, {required: true})
  providers: ProviderHealthReport[];
}
