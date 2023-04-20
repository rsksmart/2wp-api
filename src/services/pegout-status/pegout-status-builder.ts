import ExtendedBridgeTx from '../extended-bridge-tx';
import { PegoutStatus, PegoutStatusDbDataModel } from '../../models/rsk/pegout-status-data-model';
import { BRIDGE_EVENTS } from '../../utils/bridge-utils';
import { BtcAddressUtils } from '../../utils/btc-utils';
import {ExtendedBridgeEvent} from "../../models/types/bridge-transaction-parser";

export class PegoutStatusBuilder {

    public static async fillRequestReceivedStatus(extendedBridgeTx: ExtendedBridgeTx):Promise<PegoutStatusDbDataModel> {
        const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
        const releaseRequestReceivedEvent:ExtendedBridgeEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_RECEIVED)!;
        const rskSenderAddress = <string> releaseRequestReceivedEvent!.arguments.sender;
        const btcDestinationAddressHash160 = <string> releaseRequestReceivedEvent!.arguments.btcDestinationAddress;
        const utility = new BtcAddressUtils();
        const btcDestinationAddress = utility.getBtcAddressFromHash(btcDestinationAddressHash160);
        const amount = <number> releaseRequestReceivedEvent!.arguments.amount;

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
        const events: ExtendedBridgeEvent[] = extendedBridgeTx.events as ExtendedBridgeEvent[];
        const releaseRequestRejectedEvent: ExtendedBridgeEvent = events.find(event => event.name === BRIDGE_EVENTS.RELEASE_REQUEST_REJECTED)!;

        const rskSenderAddress = <string> releaseRequestRejectedEvent!.arguments.sender;
        const amount = <number> releaseRequestRejectedEvent.arguments!.amount;
        const reason = <string> releaseRequestRejectedEvent.arguments!.reason;

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
