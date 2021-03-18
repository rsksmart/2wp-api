import {inject} from '@loopback/core';
import {Broadcast} from '../services';
import {post, getModelSchemaRef, requestBody} from '@loopback/rest';
import {BroadcastRequest, BroadcastResponse} from '../models';

export class BroadcastController {
  constructor(
    @inject('services.Broadcast')
    protected broadcastProvider: Broadcast,
  ) {}

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
  sendTx(@requestBody({schema: getModelSchemaRef(BroadcastRequest)}) req: BroadcastRequest): Promise<BroadcastResponse>{
    return new Promise<BroadcastResponse>((resolve, reject) => {
      this.broadcastProvider.broadcast(req.data)
        .then(([txStatus]) => {
          resolve(new BroadcastResponse({
            txId: txStatus.result ?? '',
            error: txStatus.error ?? undefined,
          }));
        })
       .catch(reject);
    });
  }
}
