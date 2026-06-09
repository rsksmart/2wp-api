import {inject} from '@loopback/core';
import {getModelSchemaRef, post} from '@loopback/rest';
import {getLogger, Logger} from '../utils/logger';
import {BroadcastRequest, BroadcastResponse} from '../models';
import {Broadcast} from '../services';

export class BroadcastController {
  logger: Logger;

  constructor(
    @inject('services.Broadcast')
    protected broadcastProvider: Broadcast,
  ) {
    this.logger = getLogger('broadcast-controller');
  }

  @post('/broadcast', {
    requestBody: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              data: {
                type: 'string',
                pattern: '^[0-9a-fA-F]+$',
              },
            },
            required: ['data'],
            additionalProperties: false,
          },
        },
      },
      required: true,
    },
    responses: {
      '201': {
        description: 'a Tx Broadcast',
        content: {
          'application/json': {
            schema: getModelSchemaRef(BroadcastResponse),
          },
        },
      },
    },
  })
  sendTx(req: BroadcastRequest): Promise<BroadcastResponse> {
    this.logger.debug({method: 'sendTx'}, 'started');
    return new Promise<BroadcastResponse>((resolve, reject) => {
      this.broadcastProvider
        .broadcast(req.data)
        .then(([txStatus]) => {
          const txId = txStatus.result ?? 'n/a';
          const broadcastError = txStatus.error ?? 'n/a';
          this.logger.debug({method: 'sendTx', txId, broadcastError}, 'Broadcasted!');
          return resolve(
            new BroadcastResponse({
              txId: txStatus.result ?? '',
              error: txStatus.error ?? undefined,
            }),
          );
        })
        .catch((err) => {
          this.logger.warn({method: 'sendTx', err});
          return reject(err);
        });
    });
  }
}
