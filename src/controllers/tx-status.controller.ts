import {get, getModelSchemaRef, param, response,} from '@loopback/rest';
import {getLogger, Logger} from "../utils/logger";
import {inject} from "@loopback/core";
import {LastBlockInfo, PeginStatus, Status, TxStatus, TxStatusType} from '../models';
import {PeginStatusError} from "../models/pegin-status-error.model";
import {ServicesBindings} from "../dependency-injection-bindings";
import {PeginStatusService, PegoutStatusService, FlyoverService, BitcoinService} from "../services";
import {PegoutStatuses} from "../models/rsk/pegout-status-data-model";
import {ensure0x, remove0x} from '../utils/hex-utils';
import {isValidTxId} from '../utils/tx-validator';
import {TX_TYPE_PEGIN} from '../constants';


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
    this.logger = getLogger('tx-status-controller');
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
    @param.path.string('txId', {
      schema: {
        type: 'string',
        pattern: '^[a-fA-F0-9]{64}$|^0x[a-fA-F0-9]{64}$',
      },
    }) txId: string,
  ): Promise<TxStatus> {
    const startTime = performance.now();
    const status = await this.searchTryingAllTypes(txId);
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
    @param.path.string('txId', {
      schema: {
        type: 'string',
        pattern: '^[a-fA-F0-9]{64}$|^0x[a-fA-F0-9]{64}$',
      },
    }) txId: string,
    @param.path.string('txType') txType: string,
  ): Promise<TxStatus> {
    const startTime = performance.now();
    let txStatus:TxStatus;
    this.logger.warn({method: 'getTxStatusByType', txType, txId});

    if (!isValidTxId(txId)) {
      this.logger.debug({method: 'getTxStatusByType', txId}, 'the provided tx id is invalid');
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
          this.logger.warn({method: 'getTxStatusByType', txId, txType, type: nativePegoutStatus.type, protocol: 'NATIVE'});
          this.logTime(startTime);
          return nativePegoutStatus;
        }
      } catch (err) {
        this.logger.error({method: 'getTxStatusByType', err, txId, txType});
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
          this.logger.warn({method: 'getTxStatusByType', txId, txType, type: nativePeginStatus.type, protocol: 'NATIVE'});
          this.logTime(startTime);
          return nativePeginStatus;
        }
      } catch (err) {
        this.logger.error({method: 'getTxStatusByType', err, txId, txType});
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
          this.logger.warn({method: 'getTxStatusByType', txId, txType, type: flyoverStatus.type, protocol: 'FLYOVER'});
          this.logTime(startTime);
          return flyoverStatus;
        }
      } catch (err) {
        this.logger.error({method: 'getTxStatusByType', err, txId, txType});
        txStatus = new TxStatus({
          type: TxStatusType.UNEXPECTED_ERROR,
        });
        this.logTime(startTime);
        return txStatus;
      }
    }

    this.logger.error({method: 'getTxStatusByType', txId, txType}, 'Transaction not found');
    txStatus = new TxStatus({
      type: TxStatusType.UNEXPECTED_ERROR,
    });
    this.logTime(startTime);
    return txStatus;
  }

  private async searchTryingAllTypes(txId: string): Promise<TxStatus> {
    let txStatus:TxStatus;
    
    if (!isValidTxId(txId)) {
      this.logger.debug({method: 'searchTryingAllTypes', txId}, 'the provided tx id is invalid');
      txStatus = new TxStatus({
        type: TxStatusType.INVALID_DATA,
      });
      return txStatus;
    }

    try {
      const info = await this.verifyBlockBook();
      this.logger.debug({method: 'searchTryingAllTypes'}, 'trying to get block book information');
      if (!info.inSync) {
        this.logger.debug(
          {method: 'searchTryingAllTypes', initialSync: info.intialSync, inSync: info.inSync},
          'Blockbook not in sync',
        );
        return new TxStatus({ type: TxStatusType.BLOCKBOOK_FAILED });
      }
    } catch (err) {
      this.logger.error({method: 'searchTryingAllTypes', err});
      return new TxStatus({ type: TxStatusType.BLOCKBOOK_FAILED });
    }

    try {
      const nativePeginStatus = await this.getNativePeginStatus(txId);
      if(nativePeginStatus.txDetails){
        this.logger.warn({method: 'searchTryingAllTypes', txId, type: nativePeginStatus.type, protocol: 'NATIVE'});
        return nativePeginStatus;
      }
    } catch (err) {
      this.logger.error({method: 'searchTryingAllTypes', err, txId});
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
      return txStatus;
    }

    try {
      const nativePegoutStatus = await this.getNativePegoutStatus(txId);
      if(nativePegoutStatus.txDetails){
        this.logger.warn({method: 'searchTryingAllTypes', txId, type: nativePegoutStatus.type, protocol: 'NATIVE'});
        return nativePegoutStatus;
      }
    } catch (err) {
      this.logger.error({method: 'searchTryingAllTypes', err, txId});
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
      return txStatus;
    }

    try {
      const flyoverStatus = await this.getFlyoverStatus(txId);
      if(flyoverStatus.txDetails){
        this.logger.warn({method: 'searchTryingAllTypes', txId, type: flyoverStatus.type, protocol: 'FLYOVER'});
        return flyoverStatus;
      }
    } catch (err) {
      this.logger.error({method: 'searchTryingAllTypes', err, txId});
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
      return txStatus;
    }

    this.logger.error({method: 'searchTryingAllTypes', txId}, 'Transaction not found');
    txStatus = new TxStatus({
      type: TxStatusType.INVALID_DATA,
    });
    return txStatus;
  }

  private logTime(startTime:number){
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    this.logger.debug({method: 'logTime', durationMs: totalTime}, 'Execution time');
  }

  private async verifyBlockBook(): Promise<LastBlockInfo> {
    const info = await this.bitcoinService.getLastBlock();
    this.logger.debug({method: 'verifyBlockBook'}, 'trying to get block book information');
    return info;
  }

  private async getFlyoverStatus(txId: string): Promise<TxStatus> {
    let txStatus:TxStatus = new TxStatus({});
    try {
      this.logger.debug({method: 'getFlyoverStatus', txId}, 'trying to get a Flyover with txHash');
      const flyoverStatus = await this.flyoverService.getFlyoverStatus(txId);
      if (flyoverStatus) {
        this.logger.debug(
          {method: 'getFlyoverStatus', txId, type: flyoverStatus.type, status: flyoverStatus.status},
          'Flyover Status got for txId',
        );
        if (!flyoverStatus.type) {
          this.logger.debug({method: 'getFlyoverStatus', txId, type: flyoverStatus.type}, 'Flyover Status: no tx found for the provided tx id');
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
    } catch (err) {
      this.logger.error({method: 'getFlyoverStatus', err, txId});
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
      this.logger.debug({method: 'getNativePegoutStatus', txId: txHash}, 'trying to get a Native Pegout with txHash');
      const pegoutStatus = await this.pegoutStatusService.getPegoutStatusByRskTxHash(txHash);
      if (pegoutStatus.status !== PegoutStatuses.NOT_FOUND) {
        this.logger.debug({method: 'getNativePegoutStatus', txId: txHash, status: pegoutStatus.status}, 'Native Pegout Status got for txId');
        txStatus = new TxStatus({
          type: TxStatusType.PEGOUT,
          txDetails: pegoutStatus,
        });
      }
    } catch (err) {
      this.logger.error({method: 'getNativePegoutStatus', err, txId});
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
    }
    return txStatus;
  }

  private async getNativePeginStatus(txId: string): Promise<TxStatus> {
    let txStatus:TxStatus = new TxStatus({});

    try {
      const txHash = remove0x(txId);
      this.logger.debug({method: 'getNativePeginStatus', txId: txHash}, 'trying to get a pegin with txHash');
      const peginStatus = await this.getPeginStatus(txHash);
      if (
          peginStatus.status !== Status.ERROR_NOT_A_PEGIN
          && peginStatus.status !== Status.ERROR_UNEXPECTED
          && peginStatus.status !== Status.NOT_IN_BTC_YET
      ) {
        this.logger.debug({method: 'getNativePeginStatus', txId: txHash, status: peginStatus.status}, 'Pegin status got for txId');
        txStatus = new TxStatus({
          type: TxStatusType.PEGIN,
          txDetails: peginStatus,
        });
      }

    } catch (err) {
      this.logger.error({method: 'getNativePeginStatus', err, txId});
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
    }
    return txStatus;
  }

  private async getPeginStatus(txId: string): Promise<PeginStatus> {
    try {
      const result = await this.peginStatusService.getPeginStatusInfo(txId);
      this.logger.debug({method: 'getPeginStatus', txId, status: result.status}, 'Found tx with status');
      return result;
    } catch (err) {
      this.logger.warn({method: 'getPeginStatus', err, txId});
      return Promise.resolve(new PeginStatusError(txId));
    };
  }

}
