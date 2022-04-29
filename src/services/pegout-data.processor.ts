import {getLogger, Logger} from 'log4js';
import {RskTransaction} from '../models/rsk/rsk-transaction.model';
import {BRIDGE_METHODS, getBridgeSignature} from '../utils/bridge-utils';
import FilteredBridgeTransactionProcessor from '../services/filtered-bridge-transaction-processor';
import {BridgeDataFilterModel} from '../models/bridge-data-filter.model';
import {PegoutStatusDataService} from './pegout-status-data-services/pegout-status-data.service';
import {inject} from '@loopback/core';
import {BRIDGE_EVENTS} from '../utils/bridge-utils';
import {ServicesBindings} from '../dependency-injection-bindings';
import {BridgeService} from './bridge.service';

export interface TransactionArgument {
  sender: string;
  btcDestinationAddress: string;
  amount: string;
};

export class PegoutDataProcessor implements FilteredBridgeTransactionProcessor {
  logger: Logger;
  pegoutStatusDataService: PegoutStatusDataService;
  bridgeService: BridgeService

  constructor(@inject(ServicesBindings.PEGOUT_STATUS_DATA_SERVICE)
  pegoutStatusDataService: PegoutStatusDataService,
  @inject(ServicesBindings.BRIDGE_SERVICE)
  bridgeService: BridgeService) {
    this.logger = getLogger('pegoutDataProcessor');
    this.pegoutStatusDataService = pegoutStatusDataService;
    this.bridgeService = bridgeService;
  }
  async process(rskTransaction: RskTransaction): Promise<void> {
    this.logger.error('[process] Method not yet implemented');
    throw new Error('Method not yet implemented');
  }
  getFilters(): BridgeDataFilterModel[] {
    // TODO: add BRIDGE_METHODS.RELEASE_BTC = 'releaseBtc' when this method is available in the bridge abis.
    return [
      new BridgeDataFilterModel(getBridgeSignature(BRIDGE_METHODS.UPDATE_COLLECTIONS)),
      BridgeDataFilterModel.EMPTY_DATA_FILTER
    ];
  }

  async getBtcDestinationAddressFromTxReleaseRequestedReceivedEvent(rskTx: RskTransaction): Promise<string | null> {
    const bridgeTransaction = await this.bridgeService.getBridgeTransactionByHash(rskTx.hash);
    const events = bridgeTransaction.events;
    const releaseRequestReceivedEvent = events
        .find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED);

    if(!releaseRequestReceivedEvent) {
       return null;
    }

    // TODO: Remove this casting when the arguments type is changed to be the correct type (object, not array).
    const args = <TransactionArgument> <unknown>releaseRequestReceivedEvent.arguments;
    return args.btcDestinationAddress;

  }

}
