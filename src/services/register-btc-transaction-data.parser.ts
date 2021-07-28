import Web3 from 'web3';
import {Log} from '../models/rsk/log.model';
import {PeginStatusDataModel} from '../models/rsk/pegin-status-data.model';
import {Transaction} from '../models/rsk/transaction.model';
import {calculateBtcTxHash} from '../utils/btc-utils';
import {ensure0x} from '../utils/hex-utils';

// TODO: this should be an actual enum
const PEGIN_STATUSES = {
  locked: 'LOCKED',
  rejected: 'REJECTED',
  notRegistered: 'NOT_REGISTERED'
}

// TODO: instead of hardcoding the signature we should use precompiled abis library
const LOCK_BTC_SIGNATURE = '0xec2232bdbe54a92238ce7a6b45d53fb31f919496c6abe1554be1cc8eddb6600a';
const REJECTED_PEGIN_SIGNATURE = '0x708ce1ead20561c5894a93be3fee64b326b2ad6c198f8253e4bb56f1626053d6';

const BRIDGE_ABI = [{
  "name": "registerBtcTransaction",
  "type": "function",
  "constant": true,
  "inputs": [
    {
      "name": "tx",
      "type": "bytes"
    },
    {
      "name": "height",
      "type": "int256"
    },
    {
      "name": "pmt",
      "type": "bytes"
    }
  ],
  "outputs": []
}];

class PeginStatus {
  log: Log;
  status: string;

  constructor(status: string) {
    this.status = status;
  }
}

export class RegisterBtcTransactionDataParser {

  private getThisLogIfFound(logSignature: string, logs: Array<Log>): Log | null {
    for (let log of logs) {
      if (log.topics) {
        for (let topic of log.topics) {
          if (topic == logSignature) {
            return log;
          }
        }
      }
    }
    return null;
  }

  private getbtcTxId(data: Buffer): string {
    let web3 = new Web3();
    let registerBtcTransactionAbi = BRIDGE_ABI.find(m => m.name == 'registerBtcTransaction');
    if (!registerBtcTransactionAbi) {
      throw new Error('registerBtcTransaction can\'t be found in bridge ABI!');
    }
    let decodedParameters = web3.eth.abi.decodeParameters(
      registerBtcTransactionAbi.inputs,
      ensure0x(data.toString('hex').substr(10))
    );
    // Calculate btc tx id
    return ensure0x(calculateBtcTxHash(decodedParameters.tx));
  }

  private getPeginStatus(transaction: Transaction): PeginStatus {
    let lockBtcLog = this.getLockBtcLogIfExists(transaction.logs);
    let status: PeginStatus;
    if (lockBtcLog) {
      status = new PeginStatus(PEGIN_STATUSES.locked);
      status.log = lockBtcLog;
    } else if (this.hasRejectedPeginLog(transaction.logs)) {
      status = new PeginStatus(PEGIN_STATUSES.rejected);
    } else {
      status = new PeginStatus(PEGIN_STATUSES.notRegistered);
    }
    return status;
  }

  getLockBtcLogIfExists(logs: Array<Log>): Log | null {
    return this.getThisLogIfFound(LOCK_BTC_SIGNATURE, logs);
  }

  hasRejectedPeginLog(logs: Array<Log>): boolean {
    return this.getThisLogIfFound(REJECTED_PEGIN_SIGNATURE, logs) != null;
  }

  parse(transaction: Transaction): PeginStatusDataModel | null {
    if (!transaction || !transaction.logs || !transaction.logs.length) {
      // This transaction doesn't have the data required to be parsed
      return null;
    }
    let result = new PeginStatusDataModel();
    result.rskTxId = transaction.hash.toString('hex');
    result.rskBlockHeight = transaction.blockHeight;
    result.createdOn = transaction.createdOn;
    let peginStatus = this.getPeginStatus(transaction);
    result.status = peginStatus.status;
    if (result.status == PEGIN_STATUSES.locked) {
      // rsk recipient address is always the second topic
      result.rskRecipient = ensure0x(peginStatus.log.topics[1].substr(27));
      // TODO: extract the transferred value from the data of the log
      // result.value = BigInt(0);
    }
    result.btcTxId = this.getbtcTxId(transaction.data);

    return result;
  }

}
