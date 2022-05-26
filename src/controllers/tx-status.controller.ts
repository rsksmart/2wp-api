import {get, getModelSchemaRef, param, response,} from '@loopback/rest';
import {PeginStatus, Status, TxStatus, TxStatusType} from '../models';
import {PeginStatusError} from "../models/pegin-status-error.model";
import {getLogger, Logger} from "log4js";
import {inject} from "@loopback/core";
import {ServicesBindings} from "../dependency-injection-bindings";
import {PeginStatusService, PegoutStatusService} from "../services";
import {PegoutStatus} from "../models/rsk/pegout-status-data-model";

export class TxStatusController {
  private logger: Logger;

  constructor(
      @inject(ServicesBindings.PEGIN_STATUS_SERVICE)
      protected peginStatusService: PeginStatusService,
      @inject(ServicesBindings.PEGOUT_STATUS_SERVICE)
      protected pegoutStatusService: PegoutStatusService
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
    let txStatus:TxStatus;
    try {
      this.logger.debug(`[getTxStatus] Started with txId ${txId}`);
      const peginStatus = await this.getPeginStatus(txId);
      if (
          peginStatus.status !== Status.ERROR_NOT_A_PEGIN
          && peginStatus.status !== Status.ERROR_UNEXPECTED
          && peginStatus.status !== Status.NOT_IN_BTC_YET
      ) {
        this.logger.debug(`[getTxStatus] Pegin status got for txId ${txId} - Status:${peginStatus.status}`);
        txStatus = new TxStatus({
          type: TxStatusType.PEGIN,
          txDetails: peginStatus,
        });
        return txStatus;
      }
      const pegoutStatus = await this.pegoutStatusService.getPegoutStatusByRskTxHash(txId);
      if (pegoutStatus.status !== PegoutStatus.NOT_FOUND) {
        this.logger.debug(`[getTxStatus] Pegout status got for txId ${txId} - Status:${pegoutStatus.status}`);
        txStatus = new TxStatus({
          type: TxStatusType.PEGOUT,
          txDetails: pegoutStatus,
        });
        return txStatus;
      }
      this.logger.warn(`[getTxStatus] Tx id not found: ${txId}`);
      txStatus = new TxStatus({
        type: TxStatusType.INVALID_DATA,
      });
      return txStatus;
    } catch (e) {
      this.logger.warn(`[getTxStatus] Unexpected error: [${e}]`);
      txStatus = new TxStatus({
        type: TxStatusType.UNEXPECTED_ERROR,
      });
      return txStatus;
    }
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
