import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {TxV2Service} from '../';
import {BitcoinTx} from '../../models/bitcoin-tx.model';

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then((tx: any) => {

          const responseTx = new BitcoinTx();
          responseTx.txid = tx[0].txid;
          responseTx.version = tx[0].version;
          responseTx.vin = tx[0].vin;
          responseTx.vout = tx[0].vout;
          responseTx.blockhash = tx[0].blockHash;
          responseTx.blockheight = tx[0].blockHeight;
          responseTx.confirmations = tx[0].confirmations;
          responseTx.time = tx[0].time;
          responseTx.blocktime = tx[0].blockTime;
          responseTx.valueOut = tx[0].valueOut;
          responseTx.valueIn = tx[0].valueIn;
          responseTx.fees = tx[0].fees;
          responseTx.hex = tx[0].hex;
          resolve(responseTx);
        })

        .catch(reject);
    });
  }
}
