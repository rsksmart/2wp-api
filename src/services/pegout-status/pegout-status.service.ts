import {getLogger, Logger} from "log4js";
import {inject} from "@loopback/core";
import {ServicesBindings} from "../../dependency-injection-bindings";
import {PegoutStatus, PegoutStatusAppDataModel} from "../../models/rsk/pegout-status-data-model";
import {PegoutStatusDataService} from "../pegout-status-data-services/pegout-status-data.service";
import {RskNodeService} from "../rsk-node.service";
import Web3 from 'web3';
import {BridgeEvent, Transaction} from 'bridge-transaction-parser';
import {BRIDGE_EVENTS} from '../../utils/bridge-utils';
import {RskTransaction} from "../../models/rsk/rsk-transaction.model";
import {PegoutStatusBuilder} from "./pegout-status-builder";
import ExtendedBridgeTx, {ExtendedBridgeTxModel} from '../extended-bridge-tx';

export class PegoutStatusService {
    private logger: Logger;
    private pegoutStatusDataService: PegoutStatusDataService;
    private web3: Web3;
    private rskNodeService:RskNodeService;
    private ATTACH_TRANSACTION_RECEIPT = true;

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

    public getPegoutStatusByRskTxHash(rskTxHash: string): Promise<PegoutStatusAppDataModel> {
        return new Promise<PegoutStatusAppDataModel>((resolve, reject) => {
            let pegoutStatus: PegoutStatusAppDataModel = new PegoutStatusAppDataModel();
            this.pegoutStatusDataService.getLastByOriginatingRskTxHashNewest(rskTxHash)
                .then(async (pegoutStatusDbDataModel) => {
                    if (!pegoutStatusDbDataModel) {

                        //TODO Change it when bridgeTransactionParser return PENDING transaction (tx on mempool)
                        try {
                            const rskTransaction: RskTransaction = await this.rskNodeService.getTransaction(rskTxHash, this.ATTACH_TRANSACTION_RECEIPT);
                            if(rskTransaction) {
                                const receipt = rskTransaction.receipt;
                                if(receipt) {
                                    const transaction: Transaction = await this.rskNodeService.getBridgeTransaction(rskTxHash);
                                    const extendedModel: ExtendedBridgeTxModel = new ExtendedBridgeTxModel(transaction, rskTransaction);
                                    pegoutStatus = await this.processTransaction(extendedModel);
                                } else {
                                    pegoutStatus.status = PegoutStatus.PENDING;
                                }
                            } else {
                                pegoutStatus.status = PegoutStatus.NOT_FOUND;
                            }
                        }
                        catch(e) {
                            this.logger.error(`[getPegoutStatusByRskTxHash] - not found tx ${e}`);
                            pegoutStatus.status = PegoutStatus.NOT_FOUND;
                        }
                        this.logger.trace(pegoutStatus.status);

                    } else if (pegoutStatusDbDataModel.status === PegoutStatus.REJECTED) {
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

        pegoutStatus.status = PegoutStatus.NOT_PEGOUT_TX;
        return pegoutStatus;
    }

    private hasReleaseRequestReceivedEvent(events: BridgeEvent[]): boolean {
        return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);
    }
    
    private hasReleaseRequestRejectedEvent(events: BridgeEvent[]): boolean {
        return events.some(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED);
    }

    public sanitizePegout(pegoutStatus: PegoutStatusAppDataModel): PegoutStatusAppDataModel {
        if(pegoutStatus?.rskTxHash){
            const indexOf = pegoutStatus.rskTxHash.indexOf('_');
            if(indexOf > 0){
                pegoutStatus.rskTxHash = pegoutStatus.rskTxHash.substring(0, indexOf);
            }
        }
        return pegoutStatus;
    }

}
