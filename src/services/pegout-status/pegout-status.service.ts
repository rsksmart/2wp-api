import {getLogger, Logger} from "log4js";
import {inject} from "@loopback/core";
import {ServicesBindings} from "../../dependency-injection-bindings";
import {PegoutStatus, PegoutStatusAppDataModel} from "../../models/rsk/pegout-status-data-model";
import {PegoutStatusDataService} from "../pegout-status-data-services/pegout-status-data.service";

export class PegoutStatusService {
    private logger: Logger;
    private pegoutStatusDataService: PegoutStatusDataService;

    constructor(
        @inject(ServicesBindings.PEGOUT_STATUS_DATA_SERVICE)
            pegoutStatusDataService: PegoutStatusDataService,
    ) {
        this.logger = getLogger('pegoutStatusService');
        this.pegoutStatusDataService = pegoutStatusDataService;
    }


    public getPegoutStatusByRskTxHash(rskTxHash: string): Promise<PegoutStatusAppDataModel> {
        return new Promise<PegoutStatusAppDataModel>((resolve, reject) => {
            let pegoutStatus: PegoutStatusAppDataModel = new PegoutStatusAppDataModel();
            this.pegoutStatusDataService.getLastByOriginatingRskTxHash(rskTxHash)
                .then((pegoutStatusDbDataModel) => {
                    if (!pegoutStatusDbDataModel) {
                        pegoutStatus.status = PegoutStatus.NOT_FOUND;
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
}
