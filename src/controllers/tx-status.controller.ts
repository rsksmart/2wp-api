import {get, getModelSchemaRef, param, post, requestBody, response,} from '@loopback/rest';
import {getLogger, Logger} from "log4js";
import {inject} from "@loopback/core";
import {LastBlockInfo, PeginStatus, Status, TxStatus, TxStatusType} from '../models';
import {PeginStatusError} from "../models/pegin-status-error.model";
import {ServicesBindings} from "../dependency-injection-bindings";
import {PeginStatusService, PegoutStatusService, FlyoverService, BitcoinService} from "../services";
import {PegoutStatuses} from "../models/rsk/pegout-status-data-model";
import {ensure0x, remove0x} from '../utils/hex-utils';
import {isValidTxId} from '../utils/tx-validator';
import {TX_TYPE_PEGIN} from '../constants';
import { SearchTransactionPayload } from '../models/search-transaction-payload.model';


export class TxStatusController {
  private logger: Logger;

  constructor(
      @inject(ServicesBindings.PEGIN_STATUS_SERVICE)
      protected peginStatusService: PeginStatusService,
      @inject(ServicesBindings.PEGOUT_STATUS_SERVICE)
      protected pegoutStatusService: PegoutStatusService,
      @inject(ServicesBindings.FLYOVER_SERVICE)
      protected flyoverService: FlyoverService,
      @inject(ServicesBindings.BITCOIN_SERVICE)
      protected bitcoinService: BitcoinService,
  ) {
    this.logger = getLogger('TxStatusController');
  }

  @get('/tx-status/{txId}')
  @response(200, {
    description: 'TxStatus model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(TxStatus, {includeRelations: true}),
      },
    },
  })
  async getTxStatus(
    @param.path.string('txId') txId: string,
  ): Promise<TxStatus> {
    const startTime = performance.now();
    const status = this.searchTryingAllTypes(txId);
    this.logTime(startTime);
    return status;
  }

  @get('/tx-status-by-type/{txId}/{txType}')
  @response(200, {
    description: 'TxStatus model instance',
    content: {
      'application/json': {
        schema: getModelSchemaRef(TxStatus, {includeRelations: true}),
      },
    },
  })
  async getTxStatusByType(
    @param.path.string('txId') txId: string,
    @param.path.string('txType') txType: string,
  ): Promise<TxStatus> {
    const startTime = performance.now();
    let txStatus:TxStatus;
    this.logger.warn(`[getTxStatus][type=${txType}, txId=${txId}]`);

    if (!isValidTxId(txId)) {
      this.logger.debug(`[getTxStatus] the provided tx id: ${txId} is invalid`);
      txStatus = new TxStatus({
        type: TxStatusType.INVALID_DATA,
      });
      this.logTime(startTime);
      return txStatus;
    }

    if(txType === TxStatusType.PEGOUT){ 
      try {
        const nativePegoutStatus = await this.getNativePegoutStatus(txId);
        if(nativePegoutStatus.txDetails){
          this.logger.warn(`[foundTxStatus][type=${nativePegoutStatus.type}, protocol=NATIVE]`);
          this.logTime(startTime);
          return nativePegoutStatus;
        }
      } catch (e) {
        this.logger.error(`[getTxStatus] Unexpected error while retrieving status: [${e}]`);
        txStatus = new TxStatus({
          type: TxStatusType.UNEXPECTED_ERROR,
        });
        this.logTime(startTime);
        return txStatus;
      }
    }
    if(txType === TxStatusType.PEGIN){ 
      try {
        const nativePeginStatus = await this.getNativePeginStatus(txId);
        if(nativePeginStatus.txDetails){
          this.logger.warn(`[foundTxStatus][type=${nativePeginStatus.type}, protocol=NATIVE]`);
          this.logTime(startTime);
          return nativePeginStatus;
        }
      } catch (e) {
        this.logger.error(`[getTxStatus] Unexpected error while retrieving a flyover status: [${e}]`);
        txStatus = new TxStatus({
          type: TxStatusType.UNEXPECTED_ERROR,
        });
        this.logTime(startTime);
        return txStatus;
      }
    }
    if(txType === TxStatusType.FLYOVER_PEGIN || txType === TxStatusType.FLYOVER_PEGOUT){ 
      try {
        const flyoverStatus = await this.getFlyoverStatus(txId);
        if(flyoverStatus.txDetails){
          this.logger.warn(`[foundTxStatus][type=${flyoverStatus.type}, protocol=NATIVE]`);
          this.logTime(startTime);
          return flyoverStatus;
        }
      } catch (e) {
        this.logger.error(`[getTxStatus] Unexpected error while retrieving status: [${e}]`);
        txStatus = new TxStatus({
          type: TxStatusType.UNEXPECTED_ERROR,
        });
        this.logTime(startTime);
        return txStatus;
      }
    }

    this.logger.error(`[getTxStatus] Transaction not found`);
    txStatus = new TxStatus({
      type: TxStatusType.UNEXPECTED_ERROR,
    });
    this.logTime(startTime);
    return txStatus;
  }

  private async searchTryingAllTypes(txId: string): Promise<TxStatus> {
    let txStatus:TxStatus;
    
    if (!isValidTxId(txId)) {
      this.logger.debug(`[getTxStatus] the provided tx id: ${txId} is invalid`);
      txStatus = new TxStatus({
        type: TxStatusType.INVALID_DATA,
      });
      return txStatus;
    }

    try {
      const info = await this.verifyBlockBook();
      this.logger.debug('[getLastBlock] trying to get block book information');
      if (!info.inSync) {
        this.logger.debug(`[BitcoinService] - getLastBlock. Blockbook not in sync: intialSync=${info.intialSync} inSync=${info.inSync}`);
        return new TxStatus({ type: TxStatusType.BLOCKBOOK_FAILED });
      }
    } catch (e) {
      this.logger.error(`[BitcoinService] - getLastBlock. Error: ${e}`);
      return new TxStatus({ type: TxStatusType.BLOCKBOOK_FAILED });
    }

    try {
      const nativePeginStatus = await this.getNativePeginStatus(txId);
      if(nativePeginStatus.txDetails){
        this.logger.warn(`[foundTxStatus][type=${nativePeginStatus.type}, protocol=NATIVE]`);
        return nativePeginStatus;
      }
    } catch (e) {
      this.logger.error(`[getTxStatus] Unexpected error while retrieving a flyover status: [${e}]`);
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
      return txStatus;
    }

    try {
      const nativePegoutStatus = await this.getNativePegoutStatus(txId);
      if(nativePegoutStatus.txDetails){
        this.logger.warn(`[foundTxStatus][type=${nativePegoutStatus.type}, protocol=NATIVE]`);
        return nativePegoutStatus;
      }
    } catch (e) {
      this.logger.error(`[getTxStatus] Unexpected error while retrieving status: [${e}]`);
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
      return txStatus;
    }

    try {
      const flyoverStatus = await this.getFlyoverStatus(txId);
      if(flyoverStatus.txDetails){
        this.logger.warn(`[foundTxStatus][type=${flyoverStatus.type}, protocol=NATIVE]`);
        return flyoverStatus;
      }
    } catch (e) {
      this.logger.error(`[getTxStatus] Unexpected error while retrieving status: [${e}]`);
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
      return txStatus;
    }

    this.logger.error(`[getTxStatus] Transaction not found`);
    txStatus = new TxStatus({
      type: TxStatusType.UNEXPECTED_ERROR,
    });
    return txStatus;
  }

  // eslint-disable-next-line class-methods-use-this
  private logTime(startTime:number){
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    console.log(`[getTxStatus][TOTAL_TIME=${totalTime}] Execution time: ${totalTime} milliseconds`);
  }

  private async verifyBlockBook(): Promise<LastBlockInfo> {
    const info = await this.bitcoinService.getLastBlock();
    this.logger.debug('[getLastBlock] trying to get block book information');
    return info;
  }

  private async getFlyoverStatus(txId: string): Promise<TxStatus> {
    let txStatus:TxStatus = new TxStatus({});
    try {
      this.logger.debug(`[getTxStatus] trying to get a Flyover with txHash: ${txId}`);
      const flyoverStatus = await this.flyoverService.getFlyoverStatus(txId);
      if (flyoverStatus) {
        this.logger.debug(`[getTxStatus] Flyover ${flyoverStatus.type} Status got for txId ${txId} - Status: ${flyoverStatus.status}`);
        if (!flyoverStatus.type) {
          this.logger.debug(`[getTxStatus] Flyover ${flyoverStatus.type} Status: no tx found for the provided tx id: ${txId}`);
          txStatus = new TxStatus({
            type: TxStatusType.INVALID_DATA, // no tx found
          });
        }else{
          txStatus = new TxStatus({
            type: flyoverStatus.type === TX_TYPE_PEGIN ? TxStatusType.FLYOVER_PEGIN : TxStatusType.FLYOVER_PEGOUT,
            txDetails: flyoverStatus,
          });
        }
      }
    } catch (e) {
      this.logger.error(`[getTxStatus] Unexpected error while retrieving a flyover status: [${e}]`);
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
    }
    return txStatus;
  }

  private async getNativePegoutStatus(txId: string): Promise<TxStatus> {
    let txStatus:TxStatus = new TxStatus({});
    try {
      const txHash = ensure0x(txId);
      this.logger.debug(`[getTxStatus] trying to get a Native Pegout with txHash: ${txHash}`);
      const pegoutStatus = await this.pegoutStatusService.getPegoutStatusByRskTxHash(txHash);
      if (pegoutStatus.status !== PegoutStatuses.NOT_FOUND) {
        this.logger.debug(`[getTxStatus] Native Pegout Status got for txId ${txHash} - Status: ${pegoutStatus.status}`);
        txStatus = new TxStatus({
          type: TxStatusType.PEGOUT,
          txDetails: pegoutStatus,
        });
      }
    } catch (e) {
      this.logger.error(`[getTxStatus] Unexpected error while retrieving a Native Pegout Status: [${e}]`);
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
    }
    return txStatus;
  }

  private async getNativePeginStatus(txId: string): Promise<TxStatus> {
    let txStatus:TxStatus = new TxStatus({});

    try {
      const result = await this.peginStatusService.getPeginSatusInfo(txId);
      this.logger.debug(`[getPeginStatus] Found tx with status ${result.status}`);

      const txHash = remove0x(txId);
      this.logger.debug(`[getTxStatus] trying to get a pegin with txHash: ${txHash}`);
      const peginStatus = await this.getPeginStatus(txHash);
      if (
          peginStatus.status !== Status.ERROR_NOT_A_PEGIN
          && peginStatus.status !== Status.ERROR_UNEXPECTED
          && peginStatus.status !== Status.NOT_IN_BTC_YET
      ) {
        this.logger.debug(`[getTxStatus] Pegin status got for txId ${txHash} - Status: ${peginStatus.status}`);
        txStatus = new TxStatus({
          type: TxStatusType.PEGIN,
          txDetails: peginStatus,
        });
      }

    } catch (e) {
      this.logger.error(`[getTxStatus] Unexpected error while retrieving a pegin status: [${e}]`);
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
    }
    return txStatus;
  }

  private async getPeginStatus(txId: string): Promise<PeginStatus> {
    try {
      const result = await this.peginStatusService.getPeginSatusInfo(txId);
      this.logger.debug(`[getPeginStatus] Found tx with status ${result.status}`);
      return result;
    } catch (e) {
      this.logger.warn(`[getPeginStatus] Unexpected error: [${e}]`);
      return Promise.resolve(new PeginStatusError(txId));
    };
  }

}
