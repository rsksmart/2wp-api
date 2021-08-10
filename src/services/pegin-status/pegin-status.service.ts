import {inject} from '@loopback/core';
import {getLogger, Logger} from 'log4js';
import {BitcoinService, BridgeService} from '..';
import {ServicesBindings} from '../../dependency-injection-bindings';
import {BtcPeginStatus, PeginStatus, RskPeginStatus, Status} from '../../models';
import {BitcoinTx} from '../../models/bitcoin-tx.model';
import {PeginStatusDataModel} from '../../models/rsk/pegin-status-data.model';
import {Vout} from '../../models/vout.model';
import {BtcAddressUtils} from '../../utils/btc-utils';
import {ensure0x} from '../../utils/hex-utils';
import {RskAddressUtils} from '../../utils/rsk-address-utils';
import {GenericDataService} from '../generic-data-service';
import {RskNodeService} from '../rsk-node.service';

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
    rskDataService: GenericDataService<PeginStatusDataModel>
  ) {
    this.bitcoinService = bitcoinService;
    this.bridgeService = new BridgeService(
      process.env.BRIDGE_ADDRESS ??
      '0x0000000000000000000000000000000001000006',
    );
    this.rskNodeService = new RskNodeService();
    this.logger = getLogger('peginStatusService');
    this.rskDataService = rskDataService;
    this.status = Status.NOT_IN_BTC_YET;
  }

  public getPeginSatusInfo(btcTxId: string): Promise<PeginStatus> {
    this.logger.trace(`Get Pegin information for txId: ${btcTxId}`);
    return this.getBtcInfo(btcTxId)
      .then((btcStatus) => {
        const peginStatusInfo = new PeginStatus(btcStatus);
        if (this.status == Status.ERROR_BELOW_MIN || this.status == Status.ERROR_NOT_A_PEGIN) {
          peginStatusInfo.status = this.status;
          return peginStatusInfo;
        }
        if (btcStatus.requiredConfirmation <= btcStatus.confirmations) {
          return this.getRskInfo(btcTxId)
            .then((rskStatus) => {
              peginStatusInfo.setRskPeginStatus(rskStatus);
              this.logger.debug(`Tx: ${btcTxId} includes rsk info. RskAddress: ${rskStatus.recipientAddress} Pegin status: ${peginStatusInfo.status}`);
              return peginStatusInfo;
            })
            .finally(() => {
              if (peginStatusInfo.status == Status.NOT_IN_RSK_YET) {
                this.logger.debug(`Tx: ${btcTxId} not in database. Pegin status: ${peginStatusInfo.status}`);
                peginStatusInfo.rsk.recipientAddress = this.destinationAddress;
                return peginStatusInfo;
              }
            })
        } else {
          this.logger.debug(`Tx: ${btcTxId} not in database. Pegin status: ${peginStatusInfo.status}`);
          const peginRskInfo = new RskPeginStatus();
          peginRskInfo.recipientAddress = this.destinationAddress;
          peginStatusInfo.setRskPeginStatus(peginRskInfo);
          return peginStatusInfo;
        }
      })
  };

  private getBtcInfo(btcTxId: string): Promise<BtcPeginStatus> {
    return this.getBtcTxInfoFromService(btcTxId)
      .then(async (btcTxInformation) => {
        if (this.status != Status.ERROR_NOT_A_PEGIN) {
          const minPeginValue = await this.bridgeService.getMinPeginValue();
          if (this.fromSatoshiToBtc(minPeginValue) > btcTxInformation.amountTransferred) {
            const errorMessage = `Amount transferred is less than minimum pegin value.
                Minimum value accepted: [" + ${this.fromSatoshiToBtc(minPeginValue)}BTC]. Value sent:
                [${btcTxInformation.amountTransferred}BTC]`;
            this.logger.debug(errorMessage);
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
        //TODO: Ask federation to the database.
        const federationAddress = await this.bridgeService.getFederationAddress();
        if (!this.isSentToFederationAddress(federationAddress, btcTx.vout)) {
          //TODO: Comparing with the last federation. Need to include to comparing federation during the creation of the tx
          const errorMessage = `Is not a pegin. Tx is not sending to Powpeg Address: ${federationAddress}`;
          this.logger.debug(errorMessage);
          this.status = Status.ERROR_NOT_A_PEGIN;
        } else {
          const time = btcTx.time ?? btcTx.blocktime;
          btcStatus.creationDate = new Date(time * 1000); // We get Timestamp in seconds
          btcStatus.amountTransferred = this.fromSatoshiToBtc(this.getTxSentAmountByAddress(
            federationAddress,
            btcTxId,
            btcTx.vout
          ));

          btcStatus.fees = btcTx.fees ? this.fromSatoshiToBtc(btcTx.fees) : 0;
          btcStatus.confirmations = Number(btcTx.confirmations) ?? 0;
          btcStatus.requiredConfirmation = Number(process.env.BTC_CONFIRMATIONS) ?? 100;
          btcStatus.federationAddress = federationAddress;
          btcStatus.refundAddress = this.getTxRefundAddress(btcTx);
          this.destinationAddress = this.getxDestinationRskAddress(btcTx);
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

  private isSentToFederationAddress(federationAddress: string, vout: Vout[]): boolean {
    let found = false;
    for (let i = 0; vout && i < vout.length && !found; i++) {
      if (federationAddress === vout[i].addresses[0]) {
        found = true;
      }
    }
    return found;
  }

  private getTxSentAmountByAddress(federationAddress: string, txId: string, vout: Vout[]): number {
    let acummulatedAmount = 0;
    for (let i = 0; vout && i < vout.length; i++) {
      if (vout[i].isAddress && federationAddress === vout[i].addresses[0]) {
        acummulatedAmount += Number(vout[i].value!);
      }
    }
    if (acummulatedAmount == 0) {
      const errorMessage = `Can not get set amount for address: ${federationAddress} in tx: ${txId}`;
      this.logger.error(errorMessage);
    }
    return acummulatedAmount;
  }

  private getxDestinationRskAddress(btcTx: BitcoinTx): string {
    let returnValue = '';
    let foundOpReturn = false;
    const utility = new RskAddressUtils();

    for (let i = 0; btcTx.vout && i < btcTx.vout.length && !foundOpReturn; i++) {
      const voutData = btcTx.vout[i].hex!;

      if (this.hasOpReturn(btcTx.txId, voutData)) {
        returnValue = utility.getRskAddressFromOpReturn(voutData.substring(14, 54));
        this.logger.debug(`Destination RSK Address found: ${returnValue}`);
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
      if (this.hasRefundOpReturn(btcTx.txId, voutData)) {
        returnValue = utility.getRefundAddress(voutData.substring(54, 96));
        this.logger.debug(`RefundAddress found: ${returnValue}`);
        foundOpReturn = true;
      }
    }
    if (!foundOpReturn) {
      if (btcTx.vin[0].isAddress) {
        returnValue = btcTx.vin[0].addresses[0];
        this.logger.debug(`Uses sender as refund address: ${returnValue}`);
      } else {
        this.logger.warn(`Empty value for refund address`);
      }
    }
    return returnValue;
  }

  private hasRefundOpReturn(txId: string, data: string): boolean {
    if (this.hasOpReturn(txId, data)) { // Includes version 01 in the same if
      if (data.length == 96) { //Contain refund address
        return (true);
      }
    }
    return (false);
  }

  private hasOpReturn(txId: string, data: string): boolean {
    if (data.startsWith('6a') && data.substr(4, 10).startsWith('52534b5401')) { // Includes version 01 in the same if
      if (data.length == 96 || data.length == 54) { //Contain refund address
        this.logger.debug(`Tx contains OPT_RETURN value: ${txId}`);
        return (true);
      } else {
        const errorMessage = `Can not parse OP_RETURN parameter. Invalid transaction: ${txId}`;
        this.logger.warn(errorMessage);
        return false;  //RSK will return invalid
      }
    }
    return (false);
  }

}
