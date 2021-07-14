import {inject} from '@loopback/core';
import {get, getModelSchemaRef} from '@loopback/rest';
import {getLogger, Logger} from 'log4js';
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
    parameters: [{name: 'tx', schema: {type: 'string'}, in: 'query'}],
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
    return new Promise<Tx>((resolve, reject) => {
      this.txService
        .txProvider(txId)
        .then(tx => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const [
            txid,
            version,
            vin,
            vout,
            blockhash,
            blockheight,
            confirmations,
            time,
            blocktime,
            valueOut,
            valueIn,
            fees,
            hex,
          ] = tx;
          const responseTx = new Tx({
            txid,
            version,
            vin,
            vout,
            blockhash,
            blockheight,
            confirmations,
            time,
            blocktime,
            valueOut,
            valueIn,
            fees,
            hex,
          });
          resolve(responseTx);
        })
        .catch(reject);
    });
  }
}
