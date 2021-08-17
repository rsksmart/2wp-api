import Web3 from 'web3';
import {Log} from '../models/rsk/log.model';
import {PeginStatus as RskPeginStatusEnum, PeginStatusDataModel} from '../models/rsk/pegin-status-data.model';
import {RskTransaction} from '../models/rsk/rsk-transaction.model';
import {calculateBtcTxHash} from '../utils/btc-utils';
import {ensure0x} from '../utils/hex-utils';

// TODO: instead of hardcoding the signature we should use precompiled abis library
const LOCK_BTC_SIGNATURE = '0xec2232bdbe54a92238ce7a6b45d53fb31f919496c6abe1554be1cc8eddb6600a';
const PEGIN_BTC_SIGNATURE = '0x44cdc782a38244afd68336ab92a0b39f864d6c0b2a50fa1da58cafc93cd2ae5a';
const REJECTED_PEGIN_SIGNATURE = '0x708ce1ead20561c5894a93be3fee64b326b2ad6c198f8253e4bb56f1626053d6';
const RELEASE_REQUESTED_SIGNATURE = '0x7a7c29481528ac8c2b2e93aee658fddd4dc15304fa723a5c2b88514557bcc790';
const UNREFUNDABLE_PEGIN_SIGNATURE = '0x69073e221478d71cc3860ecec3a103276058912f7ebbbb37422d597842b1f4fb';

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

export class RegisterBtcTransactionDataParser {

  private getThisLogIfFound(logSignature: string, logs: Array<Log>): Log | null {
    for (const log of logs) {
      if (log.topics) {
        for (const topic of log.topics) {
          if (topic == logSignature) {
            return log;
          }
        }
      }
    }
    return null;
  }

  private hasThisLog(logSignature: string, logs: Array<Log>): boolean {
    return this.getThisLogIfFound(logSignature, logs) != null;
  }

  private getbtcTxId(data: string): string {
    const web3 = new Web3();
    const registerBtcTransactionAbi = BRIDGE_ABI.find(m => m.name == 'registerBtcTransaction');
    if (!registerBtcTransactionAbi) {
      throw new Error('registerBtcTransaction can\'t be found in bridge ABI!');
    }
    const decodedParameters = web3.eth.abi.decodeParameters(
      registerBtcTransactionAbi.inputs,
      ensure0x(data.substr(10))
    );
    // Calculate btc tx id
    return ensure0x(calculateBtcTxHash(decodedParameters.tx));
  }

  private getPeginStatus(transaction: RskTransaction): PeginStatusDataModel | undefined {
    const status = new PeginStatusDataModel();
    if (this.hasThisLog(LOCK_BTC_SIGNATURE, transaction.logs)) {
      // TODO: recipient cannot be determined with the log, it requires parsing the first input's sender
      status.status = RskPeginStatusEnum.LOCKED;
      return status;
    }
    const peginBtcLog = this.getPeginBtcLogIfExists(transaction.logs);
    if (peginBtcLog) {
      status.rskRecipient = ensure0x(peginBtcLog.topics[1].slice(- 40));
      status.status = RskPeginStatusEnum.LOCKED;
      return status;
    }
    if (this.hasThisLog(REJECTED_PEGIN_SIGNATURE, transaction.logs)) {
      if (this.hasThisLog(RELEASE_REQUESTED_SIGNATURE, transaction.logs)) {
        status.status = RskPeginStatusEnum.REJECTED_REFUND;
        return status;
      }
      if (this.hasThisLog(UNREFUNDABLE_PEGIN_SIGNATURE, transaction.logs)) {
        status.status = RskPeginStatusEnum.REJECTED_NO_REFUND;
        return status;
      }
      // TODO: THIS SHOULD NOT HAPPEN, LOG IT IF IT EVER DOES
    }

  }

  private getPeginBtcLogIfExists(logs: Array<Log>): Log | null {
    return this.getThisLogIfFound(PEGIN_BTC_SIGNATURE, logs);
  }

  parse(transaction: RskTransaction): PeginStatusDataModel | null {
    if (!transaction || !transaction.logs || !transaction.logs.length) {
      // This transaction doesn't have the data required to be parsed
      return null;
    }
    const result = this.getPeginStatus(transaction);
    if (!result) {
      return null;
    }
    result.rskTxId = transaction.hash;
    result.rskBlockHeight = transaction.blockHeight;
    result.createdOn = transaction.createdOn;
    result.btcTxId = this.getbtcTxId(transaction.data);

    return result;
  }

}
