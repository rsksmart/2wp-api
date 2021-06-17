import {getLogger, Logger} from 'log4js';
import {BitcoinService, BridgeService} from '.';
import {BtcPeginStatus, PeginStatus, RskPeginStatus, Status} from '../models';

export class PeginStatusService {
  private status: Status;
  private bridgeService: BridgeService;
  private logger: Logger;
  private bitcoinService: BitcoinService;

  constructor(bitcoinService: BitcoinService) {
    this.bitcoinService = bitcoinService;
    this.status = Status.waiting_confirmations;
    this.bridgeService = new BridgeService(
      process.env.BRIDGE_ADDRESS ??
      '0x0000000000000000000000000000000001000006',
    );
    this.logger = getLogger('pegin-status-service');
  }

  public getPeginSatusInfo(btcTxId: string): Promise<PeginStatus> {
    this.logger.trace('Get Pegin information for txId: ' + btcTxId);
    return new Promise<PeginStatus>((resolve, reject) => {
      this.getBtcInfo(btcTxId)
        .then((btcStatus) => {
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
        .catch(reject);
    })
  };

  private getBtcInfo(btcTxId: string): Promise<BtcPeginStatus> {
    return new Promise<BtcPeginStatus>((resolve, reject) => {
      this.getBtcTxInfoFromService(btcTxId)
        .then((btcTxInformation) => {
          this.bridgeService.getMinPeginValue().then((minPeginValue) => {
            if (minPeginValue > this.fromBtcToSatoshi(btcTxInformation.amountTransferred)) {  //TODO: Just >=
              const errorMessage = "Amount transferred is less or equal than minimum pegin value. " +
                "Minimum value accepted: [" + minPeginValue + "]. Value sent: [" +
                this.fromBtcToSatoshi(btcTxInformation.amountTransferred) + "]";
              this.logger.debug(errorMessage);
              throw new Error(errorMessage);
            }
            resolve(btcTxInformation);
          })
        })
        .catch(reject);
    })
  };

  private getBtcTxInfoFromService(btcTxId: string): Promise<BtcPeginStatus> {
    const btcStatus = new BtcPeginStatus(btcTxId);
    return new Promise<BtcPeginStatus>((resolve, reject) => {
      this.bitcoinService.getTx(btcTxId)
        .then((btcTx) => {
          btcStatus.creationDate = new Date(btcTx.time! * 1000); // We get Timestamp in seconds
          if (btcTx.vout && btcTx.vout.length > 0) {
            this.bridgeService.getFederationAddress()
              .then((federationAddress) => {
                if (btcTx.isSentToFederationAddress(federationAddress)) {
                  const errorMessage = 'Is not a pegin. Tx is not sending to Powpeg Address: ' + federationAddress;
                  this.logger.debug(errorMessage);
                  throw new Error(errorMessage);
                } else {
                  btcStatus.amountTransferred = btcTx.getTxSentAmount();
                  btcStatus.confirmations = Number(btcTx.confirmations) ?? 0;
                  btcStatus.requiredConfirmation = Number(process.env.BTC_CONFIRMATIONS) ?? 100; // get this information
                  btcStatus.federationAddress = btcTx.getTxSentAddress();

                  btcStatus.refundAddress = btcTx.getTxRefundAddressAddress(); // TODO: Obtain info from txoutput
                }
              })
          } else {
            const errorMessage = 'Tx dont contains output information. Txid: ' + btcTx;
            this.logger.debug(errorMessage);
            throw new Error(errorMessage);
          }

          resolve(btcStatus);
        })
        .catch(reject);
    })
  }

  private getRskInfo(): Promise<RskPeginStatus> {
    const rskStatus = new RskPeginStatus();
    rskStatus.confirmations = 0;  // TODO: Obtain information from database
    rskStatus.recipientAddress = 'receipientAddess'; // TODO: Obtain the information from database.
    this.status = Status.confirmed;  // TODO: Verify from database the final status
    return Promise.resolve(rskStatus);
  }

  private fromBtcToSatoshi(btcValue: number): number {
    return (btcValue * 100000000);
  }
}

