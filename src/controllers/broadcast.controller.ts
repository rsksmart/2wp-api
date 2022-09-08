import {inject} from '@loopback/core';
import {getModelSchemaRef, post, requestBody} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
import {BroadcastRequest, BroadcastResponse} from '../models';
import {BitcoinService} from '../services';

export class BroadcastController {
  logger: Logger;

  constructor(
    @inject('services.BitcoinService')
    protected bitcoinService: BitcoinService,
  ) {
    this.logger = getLogger('broadcast-controller');
  }

  @post('/broadcast', {
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
  sendTx(
    @requestBody({schema: getModelSchemaRef(BroadcastRequest)})
    req: BroadcastRequest,
  ): Promise<BroadcastResponse> {
    this.logger.debug('[sendTx] started');
    return new Promise<BroadcastResponse>((resolve, reject) => {
      this.bitcoinService.broadcast(req.data)
        .then((txStatus) => {
          this.logger.trace(`[sendTx] Broadcasted! txId:${txStatus.result ?? 'n/a'}. Error: ${txStatus.error ?? 'n/a'}`);
          return resolve(
            new BroadcastResponse({
              txId: txStatus.result ?? '',
              error: txStatus.error ?? undefined,
            }),
          );
        })
        .catch((reason) => {
          this.logger.warn(`[sendTx] Something went wrong. error: ${reason}`);
          return reject(reason);
        });
    });
  }
}
