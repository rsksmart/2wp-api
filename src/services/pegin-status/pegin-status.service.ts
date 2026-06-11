import {inject} from '@loopback/core';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import peginAddressVerifier from 'pegin-address-verificator';
import {getLogger, Logger} from '../../utils/logger';
import {BitcoinService, BridgeService} from '..';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {BtcPeginStatus, PeginStatus, RskPeginStatus, Status} from '../../models';
import {BitcoinTx} from '../../models/bitcoin-tx.model';
import {PeginStatusError} from '../../models/pegin-status-error.model';
import {PeginStatusDataModel} from '../../models/rsk/pegin-status-data.model';
import {Vout} from '../../models/vout.model';
import {BtcAddressUtils, calculateBtcTxHashSegWitAndNonSegwit} from '../../utils/btc-utils';
import {ensure0x} from '../../utils/hex-utils';
import {GenericDataService} from '../generic-data-service';
import {RskNodeService} from '../rsk-node.service';
import { isAFedAddress } from '../../utils/federation-addresses';

export class PeginStatusService {
  private logger: Logger;
  private bridgeService: BridgeService;
  private bitcoinService: BitcoinService;
  private rskNodeService: RskNodeService;
  private destinationAddress: string;
  private rskDataService: GenericDataService<PeginStatusDataModel>;
  private status: Status;

  constructor(
    @inject(ServicesBindings.BITCOIN_SERVICE)
    bitcoinService: BitcoinService,
    @inject(ServicesBindings.PEGIN_STATUS_DATA_SERVICE)
    rskDataService: GenericDataService<PeginStatusDataModel>,
    @inject(ServicesBindings.BRIDGE_SERVICE)
    bridgeService: BridgeService,
  ) {
    this.bitcoinService = bitcoinService;
    this.bridgeService = bridgeService;
    this.rskNodeService = new RskNodeService();
    this.logger = getLogger('peginStatusService');
    this.rskDataService = rskDataService;
  }

  public async getPeginStatusInfo(btcTxId: string): Promise<PeginStatus> {
    this.logger.debug({method: 'getPeginStatusInfo', txId: btcTxId}, 'Get Pegin information for txId');
    return this.getBtcInfo(btcTxId)
      .then((btcStatus) => {
        const peginStatusInfo = new PeginStatus(btcStatus);
        if (this.isStatusAnError()) {
          peginStatusInfo.status = this.status;
          return peginStatusInfo;
        }
        if (btcStatus.requiredConfirmation <= btcStatus.confirmations) {
          return this.getRskInfo(btcStatus.btcWTxId)
            .then((rskStatus) => {
              if (rskStatus.status !== undefined) {
                peginStatusInfo.setRskPeginStatus(rskStatus);
                this.logger.debug(
                  {method: 'getPeginStatusInfo', txId: btcTxId, rskAddress: rskStatus.recipientAddress, status: peginStatusInfo.status},
                  'Tx includes rsk info',
                );
                return peginStatusInfo;
              } else {
                const peginRskInfo = new RskPeginStatus();
                peginRskInfo.recipientAddress = this.destinationAddress;
                peginStatusInfo.status = Status.NOT_IN_RSK_YET;
                this.logger.debug({method: 'getPeginStatusInfo', txId: btcTxId, status: peginStatusInfo.status}, 'Tx not in RSK yet');
                peginStatusInfo.setRskPeginStatus(peginRskInfo);
                return peginStatusInfo;
              }
            });
        } else {
          const peginRskInfo = new RskPeginStatus();
          peginRskInfo.recipientAddress = this.destinationAddress;
          peginStatusInfo.status = Status.WAITING_CONFIRMATIONS;
          this.logger.debug({method: 'getPeginStatusInfo', txId: btcTxId, status: peginStatusInfo.status}, 'Tx waiting confirmations');
          peginStatusInfo.setRskPeginStatus(peginRskInfo);
          return peginStatusInfo;
        }
      })
      .catch((err) => {
        this.logger.warn({method: 'getPeginStatusInfo', err, txId: btcTxId});
        return new PeginStatusError(btcTxId);
      })
  };

  private getBtcInfo(btcTxId: string): Promise<BtcPeginStatus> {
    return this.getBtcTxInfoFromService(btcTxId)
      .then(async (btcTxInformation) => {
        if (this.status !== Status.ERROR_NOT_A_PEGIN) {
          const minPeginValue = await this.bridgeService.getMinPeginValue();
          if (this.fromSatoshiToBtc(minPeginValue) > btcTxInformation.amountTransferred) {
            const errorMessage = `Amount transferred is less than minimum pegin value.
            Value transferred: ${btcTxInformation.amountTransferred} - Minimum Value: ${this.fromSatoshiToBtc(minPeginValue)}`;
            this.logger.debug(
              {
                method: 'getBtcInfo',
                txId: btcTxId,
                minPeginValue: this.fromSatoshiToBtc(minPeginValue),
                amountTransferred: btcTxInformation.amountTransferred,
              },
              errorMessage,
            );
            this.status = Status.ERROR_BELOW_MIN;
          }
        }
        return btcTxInformation;
      })
  };

  private getBtcTxInfoFromService(btcTxId: string): Promise<BtcPeginStatus> {
    return this.bitcoinService.getTx(btcTxId)
      .then(async (btcTx: BitcoinTx) => {
        const btcStatus = new BtcPeginStatus(btcTxId);
        if (!btcTx) {
          this.status = Status.NOT_IN_BTC_YET;
          return btcStatus;
        }
        try {
          if (!this.canBeAPeginSender(btcTx)) {
            throw new Error(`Is not a pegin. Tx was not processed in Bitcoin network.`);
          }
          const vout = btcTx.vout;
          const fedDestinationAddress = await this.getTxDestinationFedAddress(vout);
          if (!fedDestinationAddress) {
            throw new Error('Is not a pegin. Tx was not sent to valid Federation address.');
          }
          else {
            const time = btcTx.time ?? btcTx.blocktime;
            btcStatus.creationDate = new Date(time * 1000); // We get Timestamp in seconds
            btcStatus.amountTransferred = this.fromSatoshiToBtc(this.getTxSentAmountByAddress(
              fedDestinationAddress,
              btcTxId,
              btcTx.vout
            ));
            btcStatus.btcWTxId = ensure0x(calculateBtcTxHashSegWitAndNonSegwit(btcTx.hex));            
            btcStatus.fees = btcTx.fees ? this.fromSatoshiToBtc(btcTx.fees) : 0;
            btcStatus.confirmations = Number(btcTx.confirmations) || 0;
            btcStatus.requiredConfirmation = Number(process.env.BTC_CONFIRMATIONS) || 100;
            btcStatus.federationAddress = fedDestinationAddress;
            btcStatus.refundAddress = this.getTxRefundAddress(btcTx);
            this.destinationAddress = this.getxDestinationRskAddress(btcTx);
            btcStatus.senderAddress = btcTx.vin[0].addresses[0];
          }
        } catch(err) {
          this.logger.debug({method: 'getBtcTxInfoFromService', err});
          this.status = Status.ERROR_NOT_A_PEGIN;
        }
        return btcStatus;
      })
  }

  private getRskInfo(btcTxId: string): Promise<RskPeginStatus> {
    const rskStatus = new RskPeginStatus();
    return this.rskDataService.getById(ensure0x(btcTxId)).then(async (rskData) => {
      if (rskData) {
        const bestHeight = await this.rskNodeService.getBlockNumber();
        rskStatus.confirmations = bestHeight - rskData.rskBlockHeight;
        rskStatus.recipientAddress = rskData.rskRecipient;
        rskStatus.createOn = rskData.createdOn;
        rskStatus.status = rskData.status;
      }
      return rskStatus;
    })
  }

  //TODO: Move to utils?
  private fromSatoshiToBtc(btcValue: number): number {
    return (btcValue / 100000000);
  }

  private getTxDestinationFedAddress = async(vout: Vout[]): Promise<string | undefined> => {
    let fedDestinationAddress;

    // i guess we can modify this to have a "break" after the first if = true,
    // since the fedDestAddress is just one.
    for (let i = 0; vout && i < vout.length; i++) {
      if (vout[i].isAddress && await isAFedAddress(vout[i].addresses[0])) {
        fedDestinationAddress = vout[i].addresses[0];
        return fedDestinationAddress;
      }
    }
    return fedDestinationAddress;
  }

  private getTxSentAmountByAddress(fedDestinationAddress: string, txId: string, vout: Vout[]): number {
    let acummulatedAmount = 0;

    // i guess we can modify this to have a "break" after have founding the fedAddress,
    // since the fedDestAddress is just one. as it say, the accumulatedAmount
    // will be modified for one time most.

    for (let i = 0; vout && i < vout.length; i++) {
      if (vout[i].isAddress && fedDestinationAddress === vout[i].addresses[0]) {
        acummulatedAmount += Number(vout[i].value!);
      }
    }
    if (acummulatedAmount === 0) {
      this.logger.warn({method: 'getTxSentAmountByAddress', fedDestinationAddress, txId});
    }
    return acummulatedAmount;
  }

  private getxDestinationRskAddress(btcTx: BitcoinTx): string {
    let returnValue = '';
    let foundOpReturn = false;

    for (let i = 0; btcTx.vout && i < btcTx.vout.length && !foundOpReturn; i++) {
      const voutData = btcTx.vout[i].hex!;

      if (this.hasOpReturn(btcTx.txid, voutData)) {
        returnValue = ensure0x(voutData.substring(14, 54));
        this.logger.debug({method: 'getxDestinationRskAddress', rskAddress: returnValue}, 'Destination RSK Address found');
        foundOpReturn = true;
      }
    }
    if (!foundOpReturn) {
      //FIXME: Derivate RSK address from BTC address sender.
    }
    return returnValue;
  }

  private getTxRefundAddress(btcTx: BitcoinTx): string {
    let returnValue = '';
    let foundOpReturn = false;
    const utility = new BtcAddressUtils();

    for (let i = 0; btcTx.vout && i < btcTx.vout.length && !foundOpReturn; i++) {
      const voutData = btcTx.vout[i].hex!;
      if (this.hasRefundOpReturn(btcTx.txid, voutData)) {
        returnValue = utility.getRefundAddress(voutData.substring(54, 96));
        this.logger.debug({method: 'getTxRefundAddress', refundAddress: returnValue}, 'RefundAddress found');
        foundOpReturn = true;
      }
    }
    if (!foundOpReturn) {
      returnValue = '';
      this.logger.warn({method: 'getTxRefundAddress'}, 'Empty value for refund address');
    }
    return returnValue;
  }

  private hasRefundOpReturn(txId: string, data: string): boolean {
    if (this.hasOpReturn(txId, data)) { // Includes version 01 in the same if
      if (data.length === 96) { //Contain refund address
        return (true);
      }
    }
    return (false);
  }

  private hasOpReturn(txId: string, data: string): boolean {
    if (data.startsWith('6a') && data.substr(4, 10).startsWith('52534b5401')) { // Includes version 01 in the same if
      if (data.length === 96 || data.length === 54) { //Contain refund address
        this.logger.debug({method: 'hasOpReturn', txId}, 'Tx contains OPT_RETURN value');
        return (true);
      } else {
        this.logger.warn({method: 'hasOpReturn', txId}, 'Can not parse OP_RETURN parameter. Invalid transaction');
        return false;  //RSK will return invalid
      }
    }
    return (false);
  }

  private canBeAPeginSender(btcTx: BitcoinTx): boolean {
    try {
      if (peginAddressVerifier.canPegIn(peginAddressVerifier.getAddressInformation(btcTx.vin[0].addresses[0]))) {
        return true;
      } else if (this.getxDestinationRskAddress(btcTx).length > 0) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  private isStatusAnError(): boolean {
    return (
      this.status === Status.ERROR_BELOW_MIN
      || this.status === Status.ERROR_NOT_A_PEGIN
      || this.status === Status.NOT_IN_BTC_YET
      || this.status === Status.ERROR_UNEXPECTED);
  }
}
