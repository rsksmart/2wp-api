import {getLogger, Logger} from 'log4js';
import {BridgeService} from '.';
import {BtcPeginStatus, PeginStatus, RskPeginStatus, Status} from '../models';

export class PeginStatusService {
  private status: Status;
  private bridgeService: BridgeService;
  logger: Logger;

  constructor(
  ) {
    this.status = Status.waiting_confirmations;
    this.bridgeService = new BridgeService(
      process.env.BRIDGE_ADDRESS ??
      '0x0000000000000000000000000000000001000006',
    );
    this.logger = getLogger('pegin-status-service');
  }

  public getPeginSatusInfo(btcTxId: string): Promise<PeginStatus> {
    this.logger.trace('Get Pegin information for txId: ' + btcTxId);
    return new Promise<PeginStatus>((resolve) => {
      this.getBtcInfo(btcTxId).then((btcStatus) => {
        const peginStatusInfo = new PeginStatus(btcStatus, this.status);
        if (btcStatus.requiredConfirmation <= btcStatus.confirmations) {
          this.getRskInfo().then((rskStatus) => {
            peginStatusInfo.rsk = rskStatus;
            peginStatusInfo.status = this.status;
            this.logger.debug('Tx: ' + btcTxId + ' includes rsk info. RskAddress: ' + rskStatus.recipientAddress +
              ' Pegin status: ' + peginStatusInfo.status);
            resolve(peginStatusInfo);
          })
        } else {
          this.logger.debug('Tx: ' + btcTxId + ' does not include rsk info. Pegin ststus: ' + peginStatusInfo.status)
        }
        resolve(peginStatusInfo);
      })
    })
  };

  private getBtcInfo(btcTxId: string): Promise<BtcPeginStatus> {
    return new Promise<BtcPeginStatus>((resolve) => {
      this.getBtcTxInfoFromService(btcTxId).then((btcTxInformation) => {
        if (btcTxInformation == null) { // not exists
          const errorMessage = "Not in Bitcoin Blockchain yet";
          this.logger.warn(errorMessage);
          throw new Error(errorMessage);
        } else {
          this.bridgeService.getFederationAddress()
            .then((federationAddress) => {
              if (btcTxInformation.federationAddress !== federationAddress) {
                const errorMessage = "Is not a pegin. Tx send to: " + btcTxInformation.federationAddress +
                  ' comparing with Powpeg Address: ' + federationAddress;
                this.logger.debug(errorMessage);
                throw new Error(errorMessage);
              } else {
                this.bridgeService.getMinPeginValue().then((minPeginValue) => {
                  if (minPeginValue >= btcTxInformation.amountTransferred) {
                    const errorMessage = "Amount transferred is less or equal than minimum pegin value. " +
                      "Minimum value accepted: [" + minPeginValue + "]. Value sent: [" +
                      btcTxInformation.amountTransferred + "]";
                    this.logger.debug(errorMessage);
                    throw new Error(errorMessage);
                  }
                  resolve(btcTxInformation);
                })
              }
            })
        }
      })
    })
  };

  private getBtcTxInfoFromService(btcTxId: string): Promise<BtcPeginStatus> {
    const btcStatus = new BtcPeginStatus(btcTxId);
    btcStatus.creationDate = new Date(); // TODO: Verify format and obtain info from tx
    btcStatus.amountTransferred = 1000001; //TODO: Obtain value from Tx
    btcStatus.confirmations = 500;  //TODO: Obtain info from tx
    btcStatus.requiredConfirmation = Number(process.env.BTC_CONFIRMATIONS) ?? 100; // get this information
    btcStatus.federationAddress = '2ND7Zf42GPg1JJb5TQGYXkM4Ygz74spV8MR'; //TODO: Obtain info from tx
    btcStatus.refundAddress = 'refundAddress'; // TODO: Obtain info from tx
    return Promise.resolve(btcStatus);
  }

  private getRskInfo(): Promise<RskPeginStatus> {
    const rskStatus = new RskPeginStatus();
    rskStatus.confirmations = 0;  // TODO: Obtain information from database
    rskStatus.recipientAddress = 'receipientAddess'; // TODO: Obtain the information from database.
    this.status = Status.confirmed;  // TODO: Verify from database the final status
    return Promise.resolve(rskStatus);
  }
}

