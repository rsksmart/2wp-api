import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {TxV2Service} from '.';
import {BitcoinTx} from '../models/bitcoin-tx.model';

export class BitcoinService {
  logger: Logger;

  constructor(
    @inject('services.TxV2Service')
    protected txV2Service: TxV2Service,
  ) {
    this.logger = getLogger('bitcoin-service');
  }

  getTx(txId: string): Promise<BitcoinTx> {
    return new Promise<BitcoinTx>((resolve, reject) => {
      this.txV2Service
        .txV2Provider(txId)
        .then(tx => {
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore

          const [content,] = tx;

          const resultValue = JSON.parse(JSON.stringify(content));
          this.logger.debug('resultValue[version] ' + resultValue['version']);

          const responseTx = new BitcoinTx();
          responseTx.txid = resultValue['txid'];
          responseTx.version = resultValue['version'];
          responseTx.vin = resultValue['vin'];
          responseTx.vout = resultValue['vout'];
          responseTx.blockhash = resultValue['blockHash'];
          responseTx.blockheight = resultValue['blockHeight'];
          responseTx.confirmations = resultValue['confirmations'];
          responseTx.time = resultValue['time'];
          responseTx.blocktime = resultValue['blockTime'];
          responseTx.valueOut = resultValue['valueOut'];
          responseTx.valueIn = resultValue['valueIn'];
          responseTx.fees = resultValue['fees'];
          responseTx.hex = resultValue['hex'];
          resolve(responseTx);
        })

        .catch(reject);
    });
  }
}
