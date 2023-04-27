import { BitcoinTx } from "../models/bitcoin-tx.model";
import { getLogger, Logger } from "log4js";
import axios from 'axios'

export class DaemonBitcoinService {
  logger: Logger;
  blockBookUrl: string;

  constructor(
  ) {
    this.logger = getLogger('daemon-bitcoin-service');
    this.blockBookUrl = process.env.BLOCKBOOK_URL ?? '';
  }

  getTx(txId: string): Promise<BitcoinTx> {
    return new Promise<BitcoinTx>((resolve, reject) => {
      axios.get(`${this.blockBookUrl}/api/v2/tx/${txId}`)
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
        .catch(reason => {
          this.logger.warn(`[getTx] Got an error: ${reason}`);
          reject(`Error getting tx ${txId}`);
        });
    });
  }
}
