import { BridgeEvent } from 'bridge-transaction-parser';
import ExtendedBridgeTx from '../extended-bridge-tx';
import { PegoutStatus, PegoutStatusDbDataModel } from '../../models/rsk/pegout-status-data-model';
import { BRIDGE_EVENTS } from '../../utils/bridge-utils';

export class PegoutStatusBuilder {

    public static async fillRequestReceivedStatus(extendedBridgeTx: ExtendedBridgeTx):Promise<PegoutStatusDbDataModel> {
        const events: BridgeEvent[] = extendedBridgeTx.events;
        const releaseRequestReceivedEvent:BridgeEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED)!;
        const rskSenderAddress = <string> releaseRequestReceivedEvent!.arguments.get('sender');
        const btcDestinationAddress = <string> releaseRequestReceivedEvent!.arguments.get('btcDestinationAddress');
        const amount = <number> releaseRequestReceivedEvent!.arguments.get('amount');
    
        const status: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();
        status.createdOn = extendedBridgeTx.createdOn;
        status.originatingRskTxHash = extendedBridgeTx.txHash;
        status.rskTxHash = extendedBridgeTx.txHash;
        status.rskBlockHeight = extendedBridgeTx.blockNumber;
        status.rskSenderAddress = rskSenderAddress;
        status.btcRecipientAddress = btcDestinationAddress;
        status.valueRequestedInSatoshis = amount;
        status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
        status.status = PegoutStatus.RECEIVED;
        status.rskBlockHash = extendedBridgeTx.blockHash;
        status.originatingRskBlockHash = extendedBridgeTx.blockHash;
        status.isNewestStatus = true;
    
        return status;
    }

    public static async fillRequestRejectedStatus(extendedBridgeTx: ExtendedBridgeTx):Promise<PegoutStatusDbDataModel> {
        const events: BridgeEvent[] = extendedBridgeTx.events;
        const releaseRequestRejectedEvent: BridgeEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED)!;

        const rskSenderAddress = <string> releaseRequestRejectedEvent!.arguments.get('sender');
        const amount = <number> releaseRequestRejectedEvent.arguments!.get('amount');
        const reason = <string> releaseRequestRejectedEvent.arguments!.get('reason');

        const status: PegoutStatusDbDataModel = new PegoutStatusDbDataModel();

        status.createdOn = extendedBridgeTx.createdOn;
        status.originatingRskTxHash = extendedBridgeTx.txHash;
        status.rskTxHash = extendedBridgeTx.txHash;
        status.rskBlockHeight = extendedBridgeTx.blockNumber;
        status.rskSenderAddress = rskSenderAddress;
        status.valueRequestedInSatoshis = amount;
        status.reason = reason;
        status.originatingRskBlockHeight = extendedBridgeTx.blockNumber;
        status.status = PegoutStatus.REJECTED;
        status.isNewestStatus = true;
        return status;
    }

}
