import {inject} from "@loopback/core";
import Web3 from 'web3';
import {BridgeEvent} from '@rsksmart/bridge-transaction-parser';
import {getLogger, Logger} from "../../utils/logger";
import {ServicesBindings} from "../../dependency-injection-bindings";
import {PegoutStatuses, PegoutStatusAppDataModel} from "../../models/rsk/pegout-status-data-model";
import {PegoutStatusDataService} from "../pegout-status-data-services/pegout-status-data.service";
import {RskNodeService} from "../rsk-node.service";
import {BRIDGE_EVENTS, isSuccessfulReceipt} from '../../utils/bridge-utils';
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
        this.logger = getLogger('pegout-status-service');
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
                                // `else if` rather than an early `return`: this
                                // runs inside a `.then()` that resolves at the
                                // end, so returning here would leave the request
                                // hanging — the defect phase 06 removed from
                                // this service. Without the `else` the next
                                // branch dereferences the falsy value, and the
                                // surrounding catch turns a programming error
                                // into a status.
                                pegoutStatus.status = PegoutStatuses.NOT_FOUND;
                            } else if (rskTransaction.receipt && isSuccessfulReceipt(rskTransaction.receipt)) {
                                const transaction = await this.rskNodeService.getBridgeTransaction(rskTxHash);
                                if (!transaction) {
                                    pegoutStatus.status = PegoutStatuses.NOT_FOUND;
                                } else {
                                    const extendedModel: ExtendedBridgeTxModel = new ExtendedBridgeTxModel(transaction, rskTransaction);
                                    pegoutStatus = await this.processTransaction(extendedModel);
                                }
                            } else if (rskTransaction.receipt) {
                                // Mined but reverted (or an unreadable status). The EVM never
                                // accepted these arguments, so nothing here may be handed to the
                                // ABI decoder — see isSuccessfulReceipt.
                                this.logger.debug({method: 'getPegoutStatusByRskTxHash', txId: rskTxHash}, 'Transaction did not execute successfully, not parsing it');
                                pegoutStatus.status = PegoutStatuses.NOT_FOUND;
                            } else {
                                pegoutStatus.status = PegoutStatuses.PENDING;
                                pegoutStatus.rskTxHash = rskTxHash;
                                pegoutStatus.valueRequestedInSatoshis = fromWeiNumberToSatoshiNumber(rskTransaction.value ?? 0);
                                pegoutStatus.rskSenderAddress = rskTransaction.from ?? '';
                                pegoutStatus.btcRecipientAddress = '';
                                pegoutStatus.btcRawTransaction = '';
                            }
                        }
                        catch(err) {
                            this.logger.warn({method: 'getPegoutStatusByRskTxHash', err, txId: rskTxHash});
                            pegoutStatus.status = PegoutStatuses.NOT_FOUND;
                        }
                        this.logger.debug({method: 'getPegoutStatusByRskTxHash', txId: rskTxHash, status: pegoutStatus.status});

                    } else if (pegoutStatusDbDataModel.status === PegoutStatuses.REJECTED) {
                        pegoutStatus = PegoutStatusAppDataModel.fromPegoutStatusDataModelRejected(pegoutStatusDbDataModel);
                    } else {
                        pegoutStatus = PegoutStatusAppDataModel.fromPegoutStatusDataModel(pegoutStatusDbDataModel);
                    }
                    this.logger.debug({method: 'getPegoutStatusByRskTxHash', txId: rskTxHash, status: pegoutStatus.status}, 'Pegout Status');
                    resolve(this.sanitizePegout(pegoutStatus));
                })
                .catch((err) => {
                    this.logger.warn({method: 'getPegoutStatusByRskTxHash', err, txId: rskTxHash});
                    reject(err);
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
