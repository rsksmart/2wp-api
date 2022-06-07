import {getLogger, Logger} from "log4js";
import {inject} from "@loopback/core";
import {ServicesBindings} from "../../dependency-injection-bindings";
import {PegoutStatus, PegoutStatusAppDataModel} from "../../models/rsk/pegout-status-data-model";
import {PegoutStatusDataService} from "../pegout-status-data-services/pegout-status-data.service";
import {RskNodeService} from "../rsk-node.service";
import Web3 from 'web3';
import {TransactionReceipt} from 'web3-eth';
import {BridgeEvent, Transaction} from 'bridge-transaction-parser';
import {BRIDGE_EVENTS, BRIDGE_METHODS, getBridgeSignature} from '../../utils/bridge-utils';
import { stat } from "fs";
import {RskTransaction} from "../../models/rsk/rsk-transaction.model";
import {PegoutDataProcessor} from "../pegout-data.processor";

export class PegoutStatusService {
    private logger: Logger;
    private pegoutStatusDataService: PegoutStatusDataService;
    private web3: Web3;
    private rskNodeService:RskNodeService;
    private pegoutDataProcessor:PegoutDataProcessor;

    constructor(
        @inject(ServicesBindings.PEGOUT_STATUS_DATA_SERVICE)
            pegoutStatusDataService: PegoutStatusDataService,
        @inject(ServicesBindings.RSK_NODE_SERVICE)
            rskNodeService: RskNodeService,
        @inject(ServicesBindings.PEGOUT_DATA_PROCESSOR)
            pegoutDataProcessor: PegoutDataProcessor
    ) {
        this.logger = getLogger('pegoutStatusService');
        this.pegoutStatusDataService = pegoutStatusDataService;
        this.rskNodeService = rskNodeService;
        this.web3 = new Web3(`${process.env.RSK_NODE_HOST}`);
        this.pegoutDataProcessor = pegoutDataProcessor;
    }

    public getPegoutStatusByRskTxHash(rskTxHash: string): Promise<PegoutStatusAppDataModel> {
        return new Promise<PegoutStatusAppDataModel>((resolve, reject) => {
            let pegoutStatus: PegoutStatusAppDataModel = new PegoutStatusAppDataModel();
            this.pegoutStatusDataService.getLastByOriginatingRskTxHash(rskTxHash)
                .then(async (pegoutStatusDbDataModel) => {
                    if (!pegoutStatusDbDataModel) {

                        // TODO implements the new getTransactionMethod in rskNodeService
                        const transaction:RskTransaction = await this.rskNodeService.getTransaction(rskTxHash);
                        const receipt = await this.rskNodeService.getTransactionReceipt(rskTxHash);
                        
                        if(transaction) {
                            //Process the transaction using the same rules in pegout-data-processor
                           //pegoutStatus = await this.processTransaction(transaction);
                        } else {
                            pegoutStatus.status = PegoutStatus.NOT_FOUND;
                        }

                    } else if (pegoutStatusDbDataModel.status === PegoutStatus.REJECTED) {
                        pegoutStatus.status = PegoutStatus.REJECTED;
                    } else {
                        pegoutStatus = PegoutStatusAppDataModel.fromPegoutStatusDataModel(pegoutStatusDbDataModel);
                    }
                    this.logger.debug(`TxId:${rskTxHash} Pegout Status: ${pegoutStatus.status}`);
                    resolve(pegoutStatus);
                })
                .catch((e) => {
                    this.logger.debug(`TxId:${rskTxHash} Unexpected error trying to obtain information. Error: ${e}`);
                    reject(e);
                });
        });
    }

    private async processTransaction(transaction: Transaction): Promise<PegoutStatusAppDataModel> {
        let pegoutStatus: PegoutStatusAppDataModel = new PegoutStatusAppDataModel();
        const events: BridgeEvent[] = transaction.events;

        if(this.hasReleaseRequestReceivedEvent(events)) {
            return await this.processReleaseRequestReceivedStatus(transaction);
        }
        if(this.hasReleaseRequestRejectedEvent(events)) {
            return await this.processReleaseRequestRejectedStatus(transaction);
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

      private async processReleaseRequestReceivedStatus(transaction: Transaction): Promise<PegoutStatusAppDataModel> {
        //return this.pegoutDataProcessor.fillRequestReceivedStatus(transaction.events);
        return new PegoutStatusAppDataModel();
      }

      private async processReleaseRequestRejectedStatus(transaction: Transaction): Promise<PegoutStatusAppDataModel> {
        //return this.pegoutDataProcessor.fillRequestRejectedStatus(transaction.events);
        return new PegoutStatusAppDataModel();
      }
}




