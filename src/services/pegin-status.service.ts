import {getLogger, Logger} from 'log4js';
import {BitcoinService, BridgeService} from '.';
import {BtcPeginStatus, PeginStatus, RskPeginStatus} from '../models';
import {PeginStatusDataModel} from '../models/rsk/pegin.status-data.model';
import {Vin} from '../models/vin.model';
import {Vout} from '../models/vout.model';
import {AddressUtilImplementation, AddressUtils} from '../utils/addressUtils';
import {PeginStatusDataServiceMemoryImplementation} from './pegin-status-data.service';
import {RskNodeService} from './rsk-node.service';

export class PeginStatusService {
  private logger: Logger;
  private bridgeService: BridgeService;
  private bitcoinService: BitcoinService;
  private rskNodeService: RskNodeService;
  private utility: AddressUtils;

  constructor(bitcoinService: BitcoinService) {
    this.bitcoinService = bitcoinService;
    this.bridgeService = new BridgeService(
      process.env.BRIDGE_ADDRESS ??
      '0x0000000000000000000000000000000001000006',
    );
    this.rskNodeService = new RskNodeService();
    this.logger = getLogger('peginStatusService');
    let utility = new AddressUtilImplementation();
  }

  public getPeginSatusInfo(btcTxId: string): Promise<PeginStatus> {
    this.logger.trace(`Get Pegin information for txId: ${btcTxId}`);
    return this.getBtcInfo(btcTxId)
      .then((btcStatus) => {
        const peginStatusInfo = new PeginStatus(btcStatus);
        if (btcStatus.requiredConfirmation <= btcStatus.confirmations) {
          return this.getRskInfo(btcTxId)
            .then((rskStatus) => {
              peginStatusInfo.setRskPeginStatus(rskStatus);
              this.logger.debug(`Tx: ${btcTxId} includes rsk info. RskAddress: ${rskStatus.recipientAddress}
                      Pegin status: ${peginStatusInfo.status}`);
              return peginStatusInfo;
            })
        } else {
          this.logger.debug(`Tx: ${btcTxId} does not include rsk info. Pegin ststus: ${peginStatusInfo.status}`);
          return peginStatusInfo;
        }
      })
  };

  private getBtcInfo(btcTxId: string): Promise<BtcPeginStatus> {
    return this.getBtcTxInfoFromService(btcTxId)
      .then(async (btcTxInformation) => {
        const minPeginValue = await this.bridgeService.getMinPeginValue();//.then((minPeginValue) => {
        if (this.fromSatoshiToBtc(minPeginValue) > btcTxInformation.amountTransferred) {
          const errorMessage = `Amount transferred is less than minimum pegin value.
                Minimum value accepted: [" + ${this.fromSatoshiToBtc(minPeginValue)}BTC]. Value sent:
                [${btcTxInformation.amountTransferred}BTC]`;
          this.logger.debug(errorMessage);
          throw new Error(errorMessage);
        }
        return btcTxInformation;
      })
  };

  private getBtcTxInfoFromService(btcTxId: string): Promise<BtcPeginStatus> {
    return this.bitcoinService.getTx(btcTxId)
      .then(async (btcTx) => {
        //TODO: Ask federation to the database.
        const federationAddress = await this.bridgeService.getFederationAddress();
        if (!this.isSentToFederationAddress(federationAddress, btcTx.vout)) {
          //TODO: Comparing with the last federation. Need to include to comparing federation during the creation of the tx
          const errorMessage = `Is not a pegin. Tx is not sending to Powpeg Address: ${federationAddress}`;
          this.logger.debug(errorMessage);
          throw new Error(errorMessage);
        } else {
          const btcStatus = new BtcPeginStatus(btcTxId);
          const time = btcTx.time ?? btcTx.blocktime;
          btcStatus.creationDate = new Date(time * 1000); // We get Timestamp in seconds
          btcStatus.amountTransferred = this.fromSatoshiToBtc(this.getTxSentAmountByAddress(
            federationAddress,
            btcTxId,
            btcTx.vout
          ));
          btcStatus.confirmations = Number(btcTx.confirmations) ?? 0;
          btcStatus.requiredConfirmation = Number(process.env.BTC_CONFIRMATIONS) ?? 100;
          btcStatus.federationAddress = federationAddress;
          btcStatus.refundAddress = this.getTxRefundAddress(btcTxId, btcTx.vout, btcTx.vin);

          return btcStatus;
        }
      })
  }

  private getRskInfo(btcTxId: string): Promise<RskPeginStatus> {
    const rskDataService = new PeginStatusDataServiceMemoryImplementation();
    const rskStatus = new RskPeginStatus();

    this.forTestingPurpuses(btcTxId, rskDataService);

    return rskDataService.getPeginStatus(btcTxId).then(async (rskData) => {
      let bestHeight = await this.rskNodeService.getBlockNumber();
      rskStatus.confirmations = bestHeight - rskData.rskBlockHeight;
      rskStatus.recipientAddress = rskData.rskRecipient;  //TODO: Verify, we need to send this value when is REJECT_NO_REFUND?
      rskStatus.createOn = rskData.createdOn;
      rskStatus.status = rskData.status;
      return rskStatus;
    })
  }

  //TODO: Move to utils?
  private fromSatoshiToBtc(btcValue: number): number {
    return (btcValue / 100000000);
  }

  private isSentToFederationAddress(federationAddress: string, vout: Vout[]): boolean {
    for (let i = 0; vout && i < vout.length; i++) {
      if (federationAddress == vout[i].addresses[0]) {
        return true;
      }
    }
    return false;
  }

  private getTxSentAmountByAddress(federationAddress: string, txId: string, vout: Vout[]): number {
    let acummulatedAmount = 0;
    for (let i = 0; vout && i < vout.length; i++) {
      if (federationAddress == vout[i].addresses[0]) {
        acummulatedAmount += Number(vout[i].value!);
      }
    }
    if (acummulatedAmount == 0) {
      const errorMessage = `Can not get set amount for address: ${federationAddress} in tx: ${txId}`;
      this.logger.warn(errorMessage);
      throw new Error(errorMessage);
    }
    return acummulatedAmount;
  }

  private getTxRefundAddress(txId: string, vout: Vout[], vin: Vin[]): string {
    let returnValue = '';
    let foundOpReturn = false;
    for (let i = 0; vout && i < vout.length && !foundOpReturn; i++) {
      const voutData = vout[i].hex!;
      if (this.hasRefundOpReturn(txId, voutData)) {
        returnValue = this.utility.getRefundAddress(voutData.substring(54, 96));
        this.logger.debug(`RefundAddress found: ${returnValue}`);
        foundOpReturn = true;
      }

    }
    if (!foundOpReturn) {
      returnValue = vin[0].addresses[0];
      this.logger.debug(`Uses sender as refund address: ${returnValue}`);
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
    if (data.startsWith('6a') && data.includes('52534b5401')) { // Includes version 01 in the same if
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

  //TODO: TO DELETE
  private forTestingPurpuses(btctxId: string, rskDataService: PeginStatusDataServiceMemoryImplementation) {
    let peginStatusData1 = new PeginStatusDataModel();
    peginStatusData1.btcTxId = btctxId;
    peginStatusData1.rskRecipient = 'rskRecipient1';
    peginStatusData1.createdOn = new Date();
    peginStatusData1.rskBlockHeight = 1965349;
    peginStatusData1.rskTxId = peginStatusData1.btcTxId;
    peginStatusData1.status = 'REJECTED'; //'ACCEPTED', ' REJECTED', 'INVALID'
    rskDataService.setPeginStatus(peginStatusData1);
  }

}
