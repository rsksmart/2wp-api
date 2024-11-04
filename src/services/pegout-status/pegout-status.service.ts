import {getLogger, Logger} from "log4js";
import {inject} from "@loopback/core";
import Web3 from 'web3';
import {BridgeEvent, Transaction} from 'bridge-transaction-parser';
import {ServicesBindings} from "../../dependency-injection-bindings";
import {PegoutStatuses, PegoutStatusAppDataModel} from "../../models/rsk/pegout-status-data-model";
import {PegoutStatusDataService} from "../pegout-status-data-services/pegout-status-data.service";
import {RskNodeService} from "../rsk-node.service";
import {BRIDGE_EVENTS} from '../../utils/bridge-utils';
import {RskTransaction} from "../../models/rsk/rsk-transaction.model";
import {PegoutStatusBuilder} from "./pegout-status-builder";
import ExtendedBridgeTx, {ExtendedBridgeTxModel} from '../extended-bridge-tx';
import { BtcAddressUtils, fromWeiNumberToSatoshiNumber } from "../../utils/btc-utils";
import { PegoutStatus } from "../../models";

export class PegoutStatusService {
    private logger: Logger;
    private pegoutStatusDataService: PegoutStatusDataService;
    private web3: Web3;
    private rskNodeService:RskNodeService;
    private ATTACH_TRANSACTION_RECEIPT = true;
    private btcUtils = new BtcAddressUtils();

    constructor(
        @inject(ServicesBindings.PEGOUT_STATUS_DATA_SERVICE)
            pegoutStatusDataService: PegoutStatusDataService,
        @inject(ServicesBindings.RSK_NODE_SERVICE)
            rskNodeService: RskNodeService
    ) {
        this.logger = getLogger('pegoutStatusService');
        this.pegoutStatusDataService = pegoutStatusDataService;
        this.rskNodeService = rskNodeService;
        this.web3 = new Web3(`${process.env.RSK_NODE_HOST}`);
    }

    public getPegoutStatusByRskTxHash(rskTxHash: string): Promise<PegoutStatus> {
        return new Promise<PegoutStatus>((resolve, reject) => {
            let pegoutStatus: PegoutStatusAppDataModel = new PegoutStatusAppDataModel();
            this.pegoutStatusDataService.getLastByOriginatingRskTxHashNewest(rskTxHash)
                .then(async (pegoutStatusDbDataModel) => {
                    if (!pegoutStatusDbDataModel) {

                        //TODO Change it when bridgeTransactionParser return PENDING transaction (tx on mempool)
                        try {
                            const rskTransaction: RskTransaction = await this.rskNodeService.getTransaction(rskTxHash, this.ATTACH_TRANSACTION_RECEIPT);
                            if (!rskTransaction) {
                                pegoutStatus.status = PegoutStatuses.NOT_FOUND;
                            }
                            if (rskTransaction.receipt) {
                                const transaction: Transaction = await this.rskNodeService.getBridgeTransaction(rskTxHash);
                                const extendedModel: ExtendedBridgeTxModel = new ExtendedBridgeTxModel(transaction, rskTransaction);
                                pegoutStatus = await this.processTransaction(extendedModel);
                            } else {
                                pegoutStatus.status = PegoutStatuses.PENDING;
                                pegoutStatus.rskTxHash = rskTxHash;
                                pegoutStatus.valueRequestedInSatoshis = fromWeiNumberToSatoshiNumber(rskTransaction.value ?? 0);
                                pegoutStatus.rskSenderAddress = rskTransaction.from ?? '';
                                pegoutStatus.btcRecipientAddress = '';
                                pegoutStatus.btcRawTransaction = '';
                            }
                        }
                        catch(e) {
                            this.logger.error(`[getPegoutStatusByRskTxHash] - not found tx ${e}`);
                            pegoutStatus.status = PegoutStatuses.NOT_FOUND;
                        }
                        this.logger.trace(pegoutStatus.status);

                    } else if (pegoutStatusDbDataModel.status === PegoutStatuses.REJECTED) {
                        pegoutStatus = PegoutStatusAppDataModel.fromPegoutStatusDataModelRejected(pegoutStatusDbDataModel);
                    } else {
                        pegoutStatus = PegoutStatusAppDataModel.fromPegoutStatusDataModel(pegoutStatusDbDataModel);
                    }
                    this.logger.debug(`TxId:${rskTxHash} Pegout Status: ${pegoutStatus.status}`);
                    resolve(this.sanitizePegout(pegoutStatus));
                })
                .catch((e) => {
                    this.logger.warn(`TxId:${rskTxHash} Unexpected error trying to obtain information. Error: ${e}`);
                    reject(e);
                });
        });
    }

    private async processTransaction(extendedBridgeTx: ExtendedBridgeTx): Promise<PegoutStatusAppDataModel> {
        const pegoutStatus: PegoutStatusAppDataModel = new PegoutStatusAppDataModel();
        const events = extendedBridgeTx.events;

        if(this.hasReleaseRequestReceivedEvent(events)) {
            return PegoutStatusBuilder.fillRequestReceivedStatus(extendedBridgeTx);
        }
        if(this.hasReleaseRequestRejectedEvent(events)) {
            return PegoutStatusBuilder.fillRequestRejectedStatus(extendedBridgeTx);
        }

        pegoutStatus.status = PegoutStatuses.NOT_PEGOUT_TX;
        return pegoutStatus;
    }

    private hasReleaseRequestReceivedEvent(events: BridgeEvent[]): boolean {
        return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);
    }
    
    private hasReleaseRequestRejectedEvent(events: BridgeEvent[]): boolean {
        return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);
    }

    public sanitizePegout(pegoutStatus: PegoutStatusAppDataModel): PegoutStatus {
        const status = pegoutStatus;
        if(pegoutStatus?.rskTxHash){
            const indexOf = pegoutStatus.rskTxHash.indexOf('_');
            if(indexOf > 0){
                status.rskTxHash = pegoutStatus.rskTxHash.substring(0, indexOf);
            }
        }
        return this.getPegoutStatusFromDbModel(status);
    }

    private getPegoutStatusFromDbModel(model: PegoutStatusAppDataModel): PegoutStatus {
        const {
            originatingRskTxHash,
            rskTxHash,
            rskSenderAddress,
            btcRecipientAddress,
            valueRequestedInSatoshis,
            valueInSatoshisToBeReceived,
            feeInSatoshisToBePaid,
            status,
            btcRawTransaction,
            reason,
          } = model;
          return new PegoutStatus({
            originatingRskTxHash,
            rskTxHash,
            rskSenderAddress,
            btcRecipientAddress,
            valueRequestedInSatoshis,
            valueInSatoshisToBeReceived,
            feeInSatoshisToBePaid,
            status,
            btcTxId: btcRawTransaction ? this.btcUtils.getBtcTxIdFromRawTransaction(btcRawTransaction) : undefined,
            reason,
          });
    }

}
