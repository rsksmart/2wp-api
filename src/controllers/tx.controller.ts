import {inject} from '@loopback/core';
import {get, getModelSchemaRef} from '@loopback/rest';
import {getLogger, Logger} from '../utils/logger';
import {Tx} from '../models';
import {TxService} from '../services';

export class TxController {
  logger: Logger;

  constructor(
    @inject('services.TxService')
    protected txService: TxService,
  ) {
    this.logger = getLogger('tx-controller');
  }

  @get('/tx', {
    parameters: [{
      name: 'tx', 
      schema: {
        type: 'string',
        pattern: '^[0-9a-fA-F]{64}$',
        minLength: 64,
        maxLength: 64
      }, 
      in: 'query'
    }],
    responses: {
      '200': {
        description: 'TX information',
        content: {
          'application/json': {
            schema: getModelSchemaRef(Tx),
          },
        },
      },
    },
  })
  getTx(txId: string): Promise<Tx> {
    this.logger.debug({method: 'getTx', txId}, 'started');
    return new Promise<Tx>((resolve, reject) => {
      this.txService
        .txProvider(txId)
        .then(([tx]) => {
          this.logger.trace({method: 'getTx', txId}, 'found tx!');
          return resolve(new Tx(tx));
        })
        .catch((err) => {
          this.logger.warn({method: 'getTx', err, txId});
          return reject(err);
        });
    });
  }
}
