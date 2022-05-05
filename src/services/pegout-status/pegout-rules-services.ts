import { getLogger, Logger } from 'log4js';
import { Log } from '../../models/rsk/log.model';
import { RskTransaction } from '../../models/rsk/rsk-transaction.model';
import { PegoutStatusDataModel, PegoutStatus } from '../../models/rsk/pegout-status-data.model';
import { BRIDGE_EVENTS, getBridgeSignature } from '../../utils/bridge-utils';

export class PegoutRulesService {
    private logger: Logger;
  
    constructor() {
      this.logger = getLogger('PegoutStatusRulesService');
    }

    searchStatus(transaction: RskTransaction): PegoutStatusDataModel | undefined {
        this.logger.debug(`[PegoutStatusRulesService] Started with transaction ${transaction}`);
        const status = new PegoutStatusDataModel();
        if (this.hasOnlyThisLog(getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED), transaction.logs)) {
          status.status = PegoutStatus.RECEIVED;
          return status;
        }
        if (this.hasThisLog(getBridgeSignature(BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED), transaction.logs)) {
          status.status = PegoutStatus.REJECTED;
          return status;
        }
    }

    private getThisLogIfFound(logSignature: string, logs: Array<Log>): Log | null {
        for (const log of logs) {
          if (log.topics) {
            for (const topic of log.topics) {
              if (topic == logSignature) {
                return log;
              }
            }
          }
        }
        return null;
    }
    
    private hasThisLog(logSignature: string, logs: Array<Log>): boolean {
        return this.getThisLogIfFound(logSignature, logs) != null;
    }
    
    private hasOnlyThisLog(logSignature: string, logs: Array<Log>): boolean {
        for (const log of logs) {
          if (log.topics) {
            for (const topic of log.topics) {
              if (topic != logSignature) {
                return false;
              }
            }
          }
        }
        return true;
    }

}
