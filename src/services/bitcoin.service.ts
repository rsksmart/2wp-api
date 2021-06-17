import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {TxService} from '.';
import {BitcoinTx} from '../models/bitcoin-tx.model';

export class BitcoinService {
  logger: Logger;

  constructor(
    @inject('services.TxService')
    protected txService: TxService,
  ) {

    this.logger = getLogger('bitcoin-service');
  }

  getTx(txId: string): Promise<BitcoinTx> {
    return new Promise<BitcoinTx>((resolve, reject) => {
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
          const responseTx = new BitcoinTx({
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
